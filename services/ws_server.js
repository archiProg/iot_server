// services/ws_server.js
// WebSocket transport adapter: JSON messages {cmd, param}.
// Responsibilities:
// - Maintain ws connections (clientMap)
// - Forward inbound commands to io_bridge via socket.io event "bus:cmd"
// - Receive downstream messages from io_bridge via "bus:cmd.res" and deliver to WS clients
//
// NOTE: Places requiring DB / business logic are in io_bridge.js (with TODO comments)

const WebSocket = require("ws");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const { io } = require("socket.io-client");
const { command } = require("../models/common");

let wss = null;

class WSServer {
    static clientMap = new Map();     // conn_id -> client
    static memberIndex = new Map();   // member_id -> Set(conn_id)
    static socket = null; //Socket.io

    static emitToBridge(event, data) {
        if (this.socket && this.socket.connected) {
            this.socket.emit(event, data);
        }
    }

    static start(host, port) {
        const bridgeURL = process.env.BRIDGE_URL || "http://127.0.0.1:8888";
        this.socket = io(bridgeURL, {
            transports: ["websocket"],
            auth: { instance: process.env.INSTANCE_ID || "ws" },
        });

        this.socket.on("connect", () => {
            console.log(`[WS] Connected to bridge ${bridgeURL}`);
        });
        this.socket.on("disconnect", () => {
            console.log(`[WS] Disconnected from bridge ${bridgeURL}`);
        });

        // Downstream responses/events from bridge
        this.socket.on("bus:cmd.res", (msg) => {
            this.routeToWS(msg);
        });
        this.socket.on("bus:cmd.error", (msg) => {
            console.log(`[WS.bridge.error] ${JSON.stringify(msg)}`);
            // best-effort route error back to originating connection (if provided)
            if (msg && msg.id && this.clientMap.has(msg.id)) {
                const c = this.clientMap.get(msg.id);
                try { c.socket.send(JSON.stringify({ cmd: msg.cmd || -1, success: false, message: msg.message || "error" })); } catch { }
            }
        });
        //====================================================================================================================================

        const server = http.createServer();
        wss = new WebSocket.Server({
            server,
            path: process.env.WS_PATH || "/echo",
        });

        wss.on("connection", (ws, req) => {
            const ip = req.socket.remoteAddress;
            const port = req.socket.remotePort;
            console.log(`[WS] Connect : ${ip}:${port}`);


            const client = {
                id: uuidv4(),      // conn_id
                socket: ws,
                ip,
                islogin: false,
                info: {
                    member_id: null,
                    member_name: "",
                    role: null,      // 1=user, 2=gateway (match DeviceType in response)
                },
                tenant: [],         // [{id:memberid/gatewayid, role:(1 owner,2 control,3 monitor)}]
                connectedAt: Date.now(),
                lastSeen: Date.now(),
            };

            this.clientMap.set(client.id, client);
            console.log(`[WS] Connected ${client.id} total=${this.clientMap.size}`);

            ws.on("message", (raw) => {
                client.lastSeen = Date.now();
                console.log(`[WS] raw: ${raw}`);

                let msg;
                try {
                    msg = JSON.parse(raw.toString());
                } catch {
                    ws.send(JSON.stringify({ success: false, message: "INVALID_JSON" }));
                    return;
                }

                // ✅ ต้องเป็น object (และไม่ใช่ null/array) เท่านั้น
                if (typeof msg !== "object" || msg === null || Array.isArray(msg)) {
                    ws.send(JSON.stringify({ success: false, message: "INVALID_MESSAGE_FORMAT" }));
                    return;
                }
                // Attach connection id for response routing
                msg.id = client.id;
                msg.protocol = 'ws';

                // Minimal input validation / guard
                if (typeof msg.cmd !== "number") {
                    ws.send(JSON.stringify({ success: false, message: "missing cmd" }));
                    return;
                }
                // ==========================================================================
                // Handle message command ===================================================
                // ==========================================================================
                if (msg.cmd === command.Login) {
                    if (client.islogin == true) {
                        const p = {
                            cmd: command.CommandReject,
                            param: {
                                message: 'You are already login'
                            }
                        };
                        ws.send(JSON.stringify(p));
                        console.log(`[WS][command.Login] Already login, ${client.info.member_name}`);

                        return;
                    }
                    // payload supports:
                    // {"cmd":1,"param":{"Username":"ham","Password":"123456"}} // user
                    // {"cmd":1,"param":{"Token":"adasbs123456"}} // gateway
                    this.emitToBridge("bus:cmd", msg);
                    return;
                }
                else if (msg.cmd === command.Ping) {
                    ws.send(JSON.stringify({ success: false, cmd: command.Pong, param: msg.param }));
                    return;
                }
                else if (msg.cmd === command.Pong) {

                    return;
                }

                // For any command other than login, require login
                if (!client.islogin) {
                    ws.send(JSON.stringify({ cmd: msg.cmd, success: false, message: "NOT_LOGIN" }));
                    return;
                }

                // Logout: tell bridge only for gateway (so it can broadcast offline), user logout just local
                if (msg.cmd === command.Logout) {
                    // If gateway (role != 1), notify bridge with tenant+info so it can broadcast FriendStatus offline
                    if (client.info.role != 1) {
                        msg.tenant = client.tenant;
                        msg.info = client.info;
                        this.emitToBridge("bus:cmd", msg);
                    }
                    client.islogin = false;
                    return;
                }

                // DeviceControl / DeviceUpdateValue / others: forward to bridge
                // Bridge will:
                // - check permission based on user tenant + gateway tenant
                // - route to gateway/user sessions across ws/tcp
                msg.info = client.info;
                msg.tenant = client.tenant;
                //Send to bridge, CONTROL, DEVICE_UPDATE, FRIEND_REQUEST
                this.emitToBridge("bus:cmd", msg);
            });

            ws.on("close", () => {
                // If this connection is last one for a member/gateway, send offline for gateway
                this._cleanupClient(client);
                console.log(`[WS][close] Disconnected ${client.id} total=${this.clientMap.size}`);
            });

            ws.on("error", (err) => {
                console.error(`[WS] Error ${client.id}:`, err.message);
            });
        });

        server.listen(port, host, () => {
            console.log(`[WS] ws://${host}:${port}${process.env.WS_PATH || "/echo"}`);
        });
    }

    static _cleanupClient(client) {
        const conn_id = client.id;
        const member_id = client.info.member_id;

        // remove from indexes
        if (member_id && this.memberIndex.has(member_id)) {
            const set = this.memberIndex.get(member_id);
            set.delete(conn_id);
            if (set.size === 0) {
                this.memberIndex.delete(member_id);

                // If gateway disconnect (role != 1) notify bridge for offline broadcast
                if (client.info.role != 1 && client.islogin) {
                    const msg = { cmd: command.Logout, id: conn_id, protocol: "ws", tenant: client.tenant, info: client.info, param: {} };
                    this.emitToBridge("bus:cmd", msg);
                }
            }
        }

        this.clientMap.delete(conn_id);
    }

    static _indexMember(member_id, conn_id) {
        if (!member_id) return;
        if (!this.memberIndex.has(member_id)) this.memberIndex.set(member_id, new Set());
        this.memberIndex.get(member_id).add(conn_id);
    }

    static findByMemberId(member_id) {
        const ids = this.memberIndex.get(member_id);
        if (!ids) return [];
        return [...ids].map((id) => this.clientMap.get(id)).filter(Boolean);
    }

    static routeToWS(msg) {
        // Downstream from bridge (already decided / filtered by bridge)
        if (!msg || typeof msg !== "object") return;

        // Login response must include original connection id in msg.id
        if (msg.cmd === command.Login) {
            const c = this.clientMap.get(msg.id);
            if (!c) return;

            c.islogin = !!msg.success;
            if (!c.islogin) {
                c.socket.send(JSON.stringify({ cmd: msg.cmd, success: false, message: msg.message || "auth fail" }));
                return;
            }

            // Keep old payload for old app
            // {"cmd":1,"param":{"Success":true,"MemberID":2,"Name":"Smith","DeviceType":1,"Message":"Welcome","Status":0}}
            c.info.member_id = msg.param?.MemberID ?? null;
            c.info.member_name = msg.param?.Name ?? "";
            c.info.role = msg.param?.DeviceType ?? null;
            c.tenant = Array.isArray(msg.tenant) ? msg.tenant : [];

            this._indexMember(c.info.member_id, c.id);
            console.log(`[WS] routeToWS.Login : ${JSON.stringify(c.id)}`, JSON.stringify(c.info), JSON.stringify(c.tenant));

            c.socket.send(JSON.stringify({ cmd: msg.cmd, param: { ...msg.param } }));
            return;
        }

        // FriendStatus: deliver to target member (msg.member) connections
        if (msg.cmd === command.FriendStatus) {
            // msg.member = target member id
            const targets = this.findByMemberId(msg.member);
            const payload = { cmd: command.FriendStatus, param: msg.param };
            targets.forEach((t) => {
                try { t.socket.send(JSON.stringify(payload)); } catch { }
            });
            return;
        }

        // DeviceControl / DeviceUpdateValue / RESULT / STATE (your design: cmd only)
        // Here we simply deliver to:
        // - specific conn_id if msg.id provided and exists
        // - else deliver by msg.member (target member id) if provided
        // - else ignore (bridge should set routing fields)
        if (msg.id && this.clientMap.has(msg.id)) {
            const c = this.clientMap.get(msg.id);
            try { c.socket.send(JSON.stringify({ cmd: msg.cmd, param: msg.param })); } catch { }
            return;
        }

        if (msg.member) {
            const targets = this.findByMemberId(msg.member);
            const payload = { cmd: msg.cmd, param: msg.param };
            targets.forEach((t) => {
                try { t.socket.send(JSON.stringify(payload)); } catch { }
            });
        }
    }
}

module.exports = WSServer;
