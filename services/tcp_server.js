// services/tcp_server.js
// Frame format:
// [lenOfLen][len in big-endian][cmd 2 byte LOW-HIGH][payload json]
// len = cmd(2 bytes) + payload bytes
const net = require("net");
const { v4: uuidv4 } = require("uuid");
const { io } = require("socket.io-client");
const { command } = require("../models/common");
const { log } = require("console");

class TCPServer {
  static clientMap = new Map();
  static memberIndex = new Map();
  static socket = null;

  static emitToBridge(event, data) {
    if (this.socket && this.socket.connected) this.socket.emit(event, data);
  }

  static start(host, port) {
    const bridgeURL = process.env.BRIDGE_URL || "http://127.0.0.1:8888";
    this.socket = io(bridgeURL, {
      transports: ["websocket"],
      auth: { instance: process.env.INSTANCE_ID || "tcp" },
    });

    this.socket.on("connect", () => console.log(`[TCP] Connected to bridge ${bridgeURL}`));
    this.socket.on("disconnect", () => console.log(`[TCP] Disconnected from bridge ${bridgeURL}`));
    this.socket.on("bus:cmd.res", (msg) => this.routeToTCP(msg));
    this.socket.on("bus:cmd.error", (msg) => console.log(`[TCP.bridge.error] ${JSON.stringify(msg)}`));

    const server = net.createServer((socket) => {
      const client = {
        id: uuidv4(),
        socket,
        ip: socket.remoteAddress,
        islogin: false,
        info: { member_id: null, member_name: "", role: null },
        tenant: [],
        buffer: Buffer.alloc(0),
        connectedAt: Date.now(),
        lastSeen: Date.now(),
      };

      this.clientMap.set(client.id, client);
      console.log(`[TCP] Connected ${client.id} total=${this.clientMap.size}`);

      socket.on("data", (chunk) => {
        client.lastSeen = Date.now();
        client.buffer = Buffer.concat([client.buffer, chunk]);

        while (true) {
          const parsed = this._tryParseOneFrame(client.buffer);

          if (!parsed) break;
          if (!parsed.frame) {
            client.buffer = parsed.rest;
            continue;
          }

          const { frame, rest } = parsed;
          client.buffer = rest;
          //console.log(`[TCP].payload : ${frame.jsonBytes.toString("utf8")}`);
          const msg = this._toBusMessage(client, frame.cmd, frame.jsonBytes);

          if (msg.cmd !== command.Login && !client.islogin) {
            this._sendFrame(client.socket, msg.cmd, { Success: false, Message: "NOT_LOGIN" });
            continue;
          }

          if (msg.cmd === command.Logout) {
            if (client.info.role != 1) {
              msg.tenant = client.tenant;
              msg.info = client.info;
              this.emitToBridge("bus:cmd", msg);
            }
            client.islogin = false;
            continue;
          }
          //console.log(msg);
          
          msg.info = client.info;
          msg.tenant = client.tenant;
          msg.protocol = 'tcp';
          this.emitToBridge("bus:cmd", msg);
        }
      });

      socket.on("close", () => {
        this._cleanupClient(client);
        console.log(`[TCP] Disconnected ${client.id} total=${this.clientMap.size}`);
      });

      socket.on("error", (err) => {
        console.error(`[TCP] Error ${client.id}:`, err.message);
      });
    });

    server.listen(port, host, () => console.log(`[TCP] ${host}:${port}`));
  }

  static _tryParseOneFrame(buf) {
    if (!buf || buf.length < 1) return null;
    const lenOfLen = buf.readUInt8(0);
    if (lenOfLen < 1 || lenOfLen > 4) {
      return { frame: null, rest: buf.slice(1) };
    }

    const headerNeed = 1 + lenOfLen + 2;
    if (buf.length < headerNeed) return null;

    let length = 0;
    for (let i = 0; i < lenOfLen; i++) {
      length = (length << 8) + buf.readUInt8(1 + i);
    }

    const total = 1 + lenOfLen + length;
    if (buf.length < total) return null;

    const cmdOffset = 1 + lenOfLen;
    const cmd = buf.readUInt16LE(cmdOffset); // LOW-HIGH

    const jsonLen = length - 2;
    const jsonStart = cmdOffset + 2;
    const jsonBytes = buf.slice(jsonStart, jsonStart + jsonLen);
    const rest = buf.slice(total);

    return {
      frame: { cmd, jsonBytes },
      rest,
    };
  }

  static _toBusMessage(client, cmd, jsonBytes) {
    let payloadStr = "";
    try { payloadStr = jsonBytes.toString("utf8"); } catch { payloadStr = ""; }

    let param = {};
    try {
      const parsed = JSON.parse(payloadStr);
      if (Array.isArray(parsed)) param = parsed[0] || {};
      else param = parsed || {};
    } catch {
      param = {};
    }

    return {
      cmd,
      param,
      id: client.id,
      protocol: "tcp",
    };
  }

  static _sendFrame(socket, cmd, paramObj) {
    const jsonStr = JSON.stringify(paramObj);
    const jsonBuf = Buffer.from(jsonStr, "utf8");
    const length = 2 + jsonBuf.length;

    let lenOfLen = 1;
    if (length > 0xff) lenOfLen = 2;
    if (length > 0xffff) lenOfLen = 3;
    if (length > 0xffffff) lenOfLen = 4;

    const header = Buffer.alloc(1 + lenOfLen + 2);
    header.writeUInt8(lenOfLen, 0);
    for (let i = 0; i < lenOfLen; i++) {
      const shift = (lenOfLen - 1 - i) * 8;
      header.writeUInt8((length >> shift) & 0xff, 1 + i);
    }
    header.writeUInt16LE(cmd, 1 + lenOfLen); // LOW-HIGH

    const frame = Buffer.concat([header, jsonBuf]);
    console.log(`_sendFrame:${frame.toString("hex")}`);
    console.log(`_sendFrame:${frame}`);
    
    try { socket.write(frame); } catch { }
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

  static _cleanupClient(client) {
    const conn_id = client.id;
    const member_id = client.info.member_id;
    if (member_id && this.memberIndex.has(member_id)) {
      const set = this.memberIndex.get(member_id);
      set.delete(conn_id);
      if (set.size === 0) {
        this.memberIndex.delete(member_id);
        if (client.info.role != 1 && client.islogin) {
          const msg = { cmd: command.Logout, id: conn_id, protocol: "tcp", tenant: client.tenant, info: client.info, param: {} };
          this.emitToBridge("bus:cmd", msg);
        }
      }
    }
    this.clientMap.delete(conn_id);
  }

  static routeToTCP(msg) {
    if (!msg || typeof msg !== "object") return;

    if (msg.cmd === command.Login) {
      const c = this.clientMap.get(msg.id);
      if (!c) return;
      c.islogin = !!msg.success;
      if (!c.islogin) {
        this._sendFrame(c.socket, msg.cmd, { Success: false, Message: msg.message || "auth fail" });
        return;
      }
      c.info.member_id = msg.param?.MemberID ?? null;
      c.info.member_name = msg.param?.Name ?? "";
      c.info.role = msg.param?.DeviceType ?? null;
      c.tenant = Array.isArray(msg.tenant) ? msg.tenant : [];
      this._indexMember(c.info.member_id, c.id);
      this._sendFrame(c.socket, msg.cmd, { ...msg.param });
      return;
    }

    if (msg.cmd === command.FriendStatus) {
      const targets = this.findByMemberId(msg.member);
      targets.forEach((t) => this._sendFrame(t.socket, msg.cmd, { ...msg.param }));
      return;
    }

    if (msg.id && this.clientMap.has(msg.id)) {
      const c = this.clientMap.get(msg.id);
      this._sendFrame(c.socket, msg.cmd, msg.param || {});
      return;
    }

    if (msg.member) {
      const targets = this.findByMemberId(msg.member);
      targets.forEach((t) => this._sendFrame(t.socket, msg.cmd, msg.param || {}));
    }
  }
}

module.exports = TCPServer;
