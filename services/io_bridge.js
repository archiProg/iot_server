const http = require("http");
const { Server } = require("socket.io");
const { command } = require("../models/common");
const dbw = require("./db_work");

class IOBridge {
    static start(host, port) {
        const server = http.createServer();
        const io = new Server(server, {
            cors: { origin: "*" },
            transports: ["websocket", "polling"],
        });

        io.on("connection", (socket) => {
            console.log(`[BRIDGE] Connected: ${socket.id}`);

            socket.on("bus:cmd", async (msg) => {
                try {
                    const normalized = this._normalize(msg);
                    if (!normalized.ok) {
                        socket.emit("bus:cmd.error", normalized.error);
                        return;
                    }

                    const m = normalized.msg;

                    if (m.cmd === command.Login) return await this._handleLogin(io, m);
                    if (m.cmd === command.Logout) return this._handleLogout(io, m);
                    if (m.cmd === command.DeviceControl) return await this._handleDeviceControl(io, m);
                    if (m.cmd === command.DeviceUpdateValue) return this._handleDeviceUpdateValue(io, m);
                    if (m.cmd === command.GetFriendInformation) return await this._handleGetFriendInformation(io, m);

                    io.emit("bus:cmd.res", m);
                } catch (err) {
                    socket.emit("bus:cmd.error", {
                        success: false,
                        id: msg?.id || null,
                        cmd: msg?.cmd || null,
                        message: err.message || "bridge error",
                    });
                }
            });

            socket.on("disconnect", () => {
                console.log(`[BRIDGE] Disconnected: ${socket.id}`);
            });
        });

        server.listen(port, host, () => {
            console.log(`[BRIDGE] http://${host}:${port}`);
        });
    }

    static _normalize(msg) {
        if (!msg) return { ok: false, error: { success: false, message: "missing payload" } };
        if (typeof msg !== "object") {
            try { msg = JSON.parse(msg.toString()); }
            catch (e) { return { ok: false, error: { success: false, message: `invalid json: ${e.message}` } }; }
        }
        if (!msg.id) return { ok: false, error: { success: false, message: "missing id (conn_id)" } };
        if (typeof msg.cmd !== "number") return { ok: false, error: { success: false, id: msg.id, message: "missing cmd" } };
        if (!msg.param || typeof msg.param !== "object" || Array.isArray(msg.param)) msg.param = {};
        if (!Array.isArray(msg.tenant)) msg.tenant = [];
        if (!msg.info || typeof msg.info !== "object") msg.info = {};
        return { ok: true, msg };
    }

    static _broadcastToMembers(io, members, base) {
        if (!Array.isArray(members)) return;
        for (const item of members) {
            const memberId = Number(item?.id);
            if (!memberId) continue;
            io.emit("bus:cmd.res", { ...base, member: memberId });
        }
    }

    static _hasTenantAccess(tenantList, targetId) {
        if (!Array.isArray(tenantList)) return false;
        return tenantList.some((x) => Number(x?.id) === Number(targetId));
    }

    static async _handleLogin(io, msg) {
        const param = msg.param || {};
        const connId = msg.id;
        const username = param.Username || param.username;
        const password = param.Password || param.password;
        const token = param.Token || param.token;

        let result;
        if (username && password) result = await dbw.login(username, password);
        else if (token) result = await dbw.logintoken(token);
        else {
            io.emit("bus:cmd.res", { cmd: command.Login, id: connId, success: false, message: "auth fail" });
            return;
        }

        if (!result?.success || !result?.data) {
            io.emit("bus:cmd.res", { cmd: command.Login, id: connId, success: false, message: result?.message || "auth fail" });
            return;
        }

        const memberId = Number(result.data.memberid);
        const deviceType = Number(result.data.devicetype);
        const tenant = Array.isArray(result.data.tenant) ? result.data.tenant : [];

        io.emit("bus:cmd.res", {
            cmd: command.Login,
            id: connId,
            member: memberId,
            success: true,
            param: {
                Success: true,
                MemberID: memberId,
                Name: result.data.name || "",
                DeviceType: deviceType,
                Status: 0,
                Message: "Welcome to IOT Server",
            },
            tenant,
        });

        if (deviceType !== 1 && tenant.length > 0) {
            this._broadcastToMembers(io, tenant, {
                cmd: command.FriendStatus,
                param: { MemberID: memberId, Status: 1 },
            });
        }
    }

    static _handleLogout(io, msg) {
        const memberId = Number(msg?.info?.member_id);
        const role = Number(msg?.info?.role);
        const tenant = Array.isArray(msg?.tenant) ? msg.tenant : [];
        if (!memberId || role === 1) return;
        this._broadcastToMembers(io, tenant, { cmd: command.FriendStatus, param: { MemberID: memberId, Status: 0 } });
    }

    static async _handleDeviceControl(io, msg) {
        const param = msg.param || {};
        const actorId = Number(msg?.info?.member_id);
        const gatewayId = Number(param.Member);

        if (!actorId || !gatewayId) {
            io.emit("bus:cmd.res", { cmd: command.DeviceControl, id: msg.id, success: false, param: { Success: false, Message: "Missing actor or gateway" } });
            return;
        }

        const allowed = this._hasTenantAccess(msg.tenant, gatewayId);
        if (!allowed) {
            io.emit("bus:cmd.res", {
                cmd: command.DeviceControl,
                member: actorId,
                param: {
                    Success: false,
                    Message: "Permission denied",
                    Member: actorId,
                    GatewayID: gatewayId,
                    Device: param.Device,
                    Ctrl: param.Ctrl,
                    V: param.V,
                },
                logs_id: msg.logs_id || null,
            });
            return;
        }

        io.emit("bus:cmd.res", {
            cmd: command.DeviceControl,
            member: gatewayId,
            param: {
                Device: param.Device,
                Ctrl: param.Ctrl,
                V: param.V,
            },
            logs_id: msg.logs_id || null,
        });
    }

    static _handleDeviceUpdateValue(io, msg) {
        const param = msg.param || {};
        const gatewayId = Number(param.Member || msg?.info?.member_id);
        const tenant = Array.isArray(msg?.tenant) ? msg.tenant : [];
        if (!gatewayId) return;

        this._broadcastToMembers(io, tenant, {
            cmd: command.DeviceUpdateValue,
            param: {
                Member: gatewayId,
                Device: param.Device,
                Ctrl: param.Ctrl,
                V: param.V,
            },
        });

        io.emit("bus:cmd.res", {
            cmd: command.DeviceUpdateValue,
            member: gatewayId,
            param: {
                Member: gatewayId,
                Device: param.Device,
                Ctrl: param.Ctrl,
                V: param.V,
            },
        });
    }

    static async _handleGetFriendInformation(io, msg) {
        const memberId = Number(msg?.info?.member_id) || null;
        const tenant = Array.isArray(msg?.tenant) ? msg.tenant : [];
        const res = await dbw.getFriendInformation(memberId, tenant);

        io.emit("bus:cmd.res", {
            cmd: command.FriendInformation,
            id: msg.id,
            member: memberId,
            success: !!res?.success,
            param: res?.data || { Success: false, Message: res?.message || "SERVER_ERROR", Member: {} },
        });
    }
}

module.exports = IOBridge;
