const bcrypt = require("bcrypt");
const db = require("./db_service");

async function getTenant(memberid, devicetype) {
    const roleDefault = 2;

    if (Number(devicetype) === 1) {
        const sql = `
      SELECT friend_id AS id
      FROM friends
      WHERE member_id = ?

      UNION

      SELECT memberid AS id
      FROM member
      WHERE owner = ?
    `;

        const rows = await db.select(sql, [memberid, memberid]);
        return rows.map(r => ({ id: Number(r.id), role: roleDefault }));
    } else {
        const sql = `
      SELECT memberid AS id
      FROM friend
      WHERE friend = ?

      UNION

      SELECT owner AS id
      FROM member
      WHERE memberid = ?
    `;

        const rows = await db.select(sql, [memberid, memberid]);
        return rows.map(r => ({ id: Number(r.id), role: roleDefault }));
    }
}

async function login(username, password) {
    try {
        const sql = `
      SELECT memberid, devicetype, username, password, membername, state
      FROM member
      WHERE username = ?
      LIMIT 1
    `;

        const rows = await db.select(sql, [username]);

        if (!rows || rows.length === 0) {
            return { success: false, message: "INVALID_USERNAME_OR_PASSWORD" };
        }

        const m = rows[0];
        const ok = await bcrypt.compare(password, m.password || "");
        if (!ok) {
            return { success: false, message: "INVALID_USERNAME_OR_PASSWORD" };
        }

        const tenant = await getTenant(m.memberid, m.devicetype);

        return {
            success: true,
            data: {
                memberid: Number(m.memberid),
                name: m.membername,
                devicetype: Number(m.devicetype),
                username: m.username,
                tenant,
            }
        };
    } catch (err) {
        console.error("[db_work.login] error:", err);
        return { success: false, message: "SERVER_ERROR" };
    }
}

async function logintoken(token) {
    try {
        const sql = `
      SELECT m.memberid, m.devicetype, m.username, m.membername, m.state,
             t.token, t.validfrom, t.expire
      FROM public.membertokenlogin t
      JOIN member m ON m.memberid = t.memberid
      WHERE t.token = ?
      LIMIT 1
    `;

        const rows = await db.select(sql, [token]);

        if (!rows || rows.length === 0) {
            return { success: false, message: "INVALID_TOKEN" };
        }

        const r = rows[0];
        const tenant = await getTenant(r.memberid, r.devicetype);

        return {
            success: true,
            data: {
                memberid: Number(r.memberid),
                name: r.membername,
                devicetype: Number(r.devicetype),
                username: r.username,
                tenant,
            },
        };
    } catch (err) {
        console.error("[db_work.logintoken] error:", err);
        return { success: false, message: "SERVER_ERROR" };
    }
}

function _placeholders(arr) {
    return arr.map(() => "?").join(",");
}

async function getFriendInformation(requestMemberId, tenantList) {
    try {
        const gatewayIds = (Array.isArray(tenantList) ? tenantList : [])
            .map(x => Number(x?.id))
            .filter(x => Number.isFinite(x) && x > 0);

        const result = {
            Success: true,
            Message: "",
            Member: {},
        };

        if (gatewayIds.length === 0) {
            return { success: true, data: result };
        }

        const ph = _placeholders(gatewayIds);

        const memberSql = `
          SELECT m.memberid, m.membername, m.devicetype
          FROM member m
          WHERE m.memberid IN (${ph})
            AND COALESCE(m.devicetype, 0) != 1
          ORDER BY m.memberid ASC
        `;
        const memberRows = await db.select(memberSql, gatewayIds);

        if (!memberRows || memberRows.length === 0) {
            return { success: true, data: result };
        }

        const validGatewayIds = memberRows.map(r => Number(r.memberid));
        const memberMap = {};

        for (const row of memberRows) {
            const memberId = Number(row.memberid);
            memberMap[memberId] = {
                Status: 1,
                Img: "",
                Name: row.membername || "",
                DeviceType: Number(row.devicetype) || 0,
                Room: {},
                Device: {},
            };
        }

        const ph2 = _placeholders(validGatewayIds);

        const deviceSql = `
          SELECT d.memberid, d.deviceid, d.devicestyleid, d.devicename,
                 COALESCE(d.devicestatustext, '') AS devicestatustext
          FROM devices d
          WHERE d.memberid IN (${ph2})
          ORDER BY d.memberid ASC, d.deviceid ASC
        `;
        const deviceRows = await db.select(deviceSql, validGatewayIds);

        for (const row of deviceRows || []) {
            const memberId = Number(row.memberid);
            const deviceId = Number(row.deviceid);

            if (!memberMap[memberId] || !deviceId) continue;

            // deviceid 30000 = Room definition only, do not include in Device list
            if (deviceId === 30000) continue;

            memberMap[memberId].Device[String(deviceId)] = {
                DeviceStyleID: Number(row.devicestyleid) || 0,
                DeviceName: row.devicename || "",
                DeviceStatusText: row.devicestatustext || "",
                Control: {},
            };
        }

        const controlSql = `
          SELECT c.memberid, c.deviceid, c.controlid, c.contypeid, c.iscustomimg, c.label, c.lastvalue
          FROM devicescontrol c
          WHERE c.memberid IN (${ph2})
          ORDER BY c.memberid ASC, c.deviceid ASC, c.controlid ASC
        `;
        const controlRows = await db.select(controlSql, validGatewayIds);

        for (const row of controlRows || []) {
            const memberId = Number(row.memberid);
            const deviceId = Number(row.deviceid);
            const controlId = Number(row.controlid);

            if (!memberMap[memberId] || !Number.isFinite(controlId)) continue;

            // Room map from deviceid 30000
            if (deviceId === 30000) {
                memberMap[memberId].Room[String(controlId)] = {
                    Name: row.label || "",
                    Icon: Number(row.lastvalue) || 0,
                };
                continue;
            }

            const device = memberMap[memberId]?.Device?.[String(deviceId)];
            if (!device) continue;

            device.Control[String(controlId)] = {
                ControlType: Number(row.contypeid) || 0,
                IsCustomImg: !!row.iscustomimg,
                Label: row.label || "",
                Value: Number(row.lastvalue) || 0,
            };
        }

        result.Member = Object.fromEntries(
            Object.entries(memberMap).map(([k, v]) => [String(k), v])
        );

        return { success: true, data: result };
    } catch (err) {
        console.error("[db_work.getFriendInformation] error:", err);
        return {
            success: false,
            message: "SERVER_ERROR",
            data: { Success: false, Message: "SERVER_ERROR", Member: {} }
        };
    }
}

module.exports = {
    login,
    logintoken,
    getTenant,
    getFriendInformation,
};
