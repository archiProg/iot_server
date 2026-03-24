const bcrypt = require("bcrypt");
const db = require("./db_service");

function toNumberOrNull(v) {
    return v == null ? null : Number(v);
}

const userlogin = async (_username) => {
    if (!_username) {
        console.log("username missing");
    }
    //query db
    try {
        const sql = `
      SELECT * FROM "member"  where devicetype = 1 and username = ?
    `;

        const rows = await db.select(sql, [_username]);

        return { success: true, response: rows, error: null };
    } catch (err) {
        return { success: false, response: null, error: err };
    }
};

const memberIDlogin = async (_memberIDlogin) => {
    if (!_memberIDlogin) {
        console.log("memberID missing");
    }
    //query db
    try {
        const sql = `
      SELECT * FROM "member"  where devicetype = 1 and memberid = ?
    `;

        const rows = await db.select(sql, [_memberIDlogin]);

        return { success: true, response: rows, error: null };
    } catch (err) {
        return { success: false, response: null, error: err };
    }
};

///app/v3s/GetFloorPlan

const getFloorPlan = async (memberID) => {
    const memberIdNum = Number(memberID);

    const propertyRows = await db.select(
        `
        SELECT
            p.propertyid AS "propertyID",
            p.propertyname AS "name",
            p.image AS "image",
            p.config AS "config"
        FROM public.fp_propertyaccess pa
        INNER JOIN public.fp_property p
            ON p.propertyid = pa.propertyid
        WHERE pa.memberid = :memberID
        ORDER BY p.propertyid;
        `,
        { memberID: memberIdNum },
    );

    const response = {
        status: 1,
        property: [],
    };

    if (!propertyRows.length) {
        return { success: true, response: response, error: null };
    }

    const propertyIDs = propertyRows.map((r) => Number(r.propertyID));
    //console.log(`getFloorPlan:${propertyIDs}`);

    const floorRows = await db.select(
        `
        SELECT
            f.propertyid AS "propertyID",
            f.floorid AS "floorID",
            f.floorname AS "name",
            f.image AS "image",
            f.imageheight AS "imageHeight",
            f.imagewidth AS "imageWidth"
        FROM public.fp_floor f
        WHERE f.propertyid IN (:propertyIDs)
        ORDER BY f.propertyid, f.floorid;
        `,
        { propertyIDs },
    );

    const zoneRows = await db.select(
        `
        SELECT
            z.propertyid AS "propertyID",
            z.floorid AS "floorID",
            z.zoneid AS "zoneID",
            z.zonename AS "name",
            z.zoneimage AS "zoneImage"
        FROM public.fp_zone z
        WHERE z.propertyid IN (:propertyIDs)
        ORDER BY z.propertyid, z.floorid, z.zoneid;
        `,
        { propertyIDs },
    );

    const deviceRows = await db.select(
        `
        SELECT
            fd.propertyid AS "propertyID",
            fd.floorid AS "floorID",
            fd.zoneid AS "zoneID",
            fd.memberid AS "memberID",
            fd.deviceid AS "deviceID",
            d.devicestyleid AS "deviceType",
            COALESCE(NULLIF(d.devicename, ''), ds.name, '') AS "name",
            fd.x AS "x",
            fd.y AS "y"
        FROM public.fp_device fd
        INNER JOIN public.devices d
            ON d.memberid = fd.memberid
           AND d.deviceid = fd.deviceid
        LEFT JOIN public.devicestyle ds
            ON ds.devicestyleid = d.devicestyleid
        WHERE fd.propertyid IN (:propertyIDs)
        ORDER BY fd.propertyid, fd.floorid, fd.zoneid, fd.memberid, fd.deviceid;
        `,
        { propertyIDs },
    );

    const controlRows = await db.select(
        `
        SELECT
            fd.propertyid AS "propertyID",
            fd.floorid AS "floorID",
            fd.zoneid AS "zoneID",
            dc.memberid AS "memberID",
            dc.deviceid AS "deviceID",
            dc.controlid AS "controlID",
            dc.label AS "label",
            dc.lastvalue AS "v"
        FROM public.fp_device fd
        INNER JOIN public.devicescontrol dc
            ON dc.memberid = fd.memberid
           AND dc.deviceid = fd.deviceid
        WHERE fd.propertyid IN (:propertyIDs)
        ORDER BY fd.propertyid, fd.floorid, fd.zoneid, dc.memberid, dc.deviceid, dc.controlid;
        `,
        { propertyIDs },
    );

    const propertyMap = new Map();
    const floorMap = new Map();
    const zoneMap = new Map();
    const deviceMap = new Map();

    for (const row of propertyRows) {
        const property = {
            propertyID: Number(row.propertyID),
            name: row.name,
            image: row.image,
            config: row.config == null ? null : String(row.config),
            floors: [],
        };

        propertyMap.set(`${property.propertyID}`, property);
        response.property.push(property);
    }

    for (const row of floorRows) {
        const property = propertyMap.get(`${Number(row.propertyID)}`);
        if (!property) continue;

        const floor = {
            propertyID: Number(row.propertyID),
            floorID: Number(row.floorID),
            name: row.name,
            image: row.image,
            imageHeight: toNumberOrNull(row.imageHeight),
            imageWidth: toNumberOrNull(row.imageWidth),
            zones: [],
        };

        floorMap.set(`${floor.propertyID}:${floor.floorID}`, floor);
        property.floors.push(floor);
    }

    for (const row of zoneRows) {
        const floor = floorMap.get(
            `${Number(row.propertyID)}:${Number(row.floorID)}`,
        );
        if (!floor) continue;

        const zone = {
            propertyID: Number(row.propertyID),
            floorID: Number(row.floorID),
            zoneID: Number(row.zoneID),
            name: row.name,
            zoneImage: row.zoneImage,
            devices: [],
        };

        zoneMap.set(`${zone.propertyID}:${zone.floorID}:${zone.zoneID}`, zone);
        floor.zones.push(zone);
    }

    for (const row of deviceRows) {
        const zone = zoneMap.get(
            `${Number(row.propertyID)}:${Number(row.floorID)}:${Number(row.zoneID)}`,
        );
        if (!zone) continue;

        const device = {
            propertyID: Number(row.propertyID),
            floorID: Number(row.floorID),
            zoneID: Number(row.zoneID),
            memberID: Number(row.memberID),
            deviceID: Number(row.deviceID),
            deviceType: Number(row.deviceType),
            name: row.name,
            x: Number(row.x),
            y: Number(row.y),
            deviceControls: [],
        };

        const deviceKey = [
            device.propertyID,
            device.floorID,
            device.zoneID,
            device.memberID,
            device.deviceID,
        ].join(":");

        deviceMap.set(deviceKey, device);
        zone.devices.push(device);
    }

    for (const row of controlRows) {
        const deviceKey = [
            Number(row.propertyID),
            Number(row.floorID),
            Number(row.zoneID),
            Number(row.memberID),
            Number(row.deviceID),
        ].join(":");

        const device = deviceMap.get(deviceKey);
        if (!device) continue;

        device.deviceControls.push({
            controlID: Number(row.controlID),
            label: row.label,
            v: Number(row.v),
        });
    }

    return { success: true, response, error: null };
};

const updateStateUser = async (memberID, state) => {
    try {
        const sql = `
      UPDATE "member" SET state = ? where memberid = ?
    `;
        await db.update(sql, [state, memberID]);

        return { success: true, error: null };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

const deleteAccount = async (memberID) => {
    try {
        const sql = `
      DELETE FROM "member" WHERE memberid = ?
    `;
        await db.remove(sql, [memberID]);
        return { success: true, error: null };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

const getFriendlistInHome = async (HomeID) => {
    try {
        const sql = `SELECT f.member_id as memberID, m.membername as memberName, f.frid as role  FROM "friends" f 
                 INNER JOIN  "member" m  ON m.memberid = f.member_id and f.member_id!= ? WHERE f.friend_id = ?;`;
        const result = await db.select(sql, [HomeID, HomeID]);
        return { success: true, response: result, error: null };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

const getFriendrolelist = async (memberID) => {
    try {
        const sql = `
      SELECT * FROM "member" WHERE memberid = ?
    `;
        const result = await db.select(sql, [memberID]);
        return { success: true, response: result, error: null };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

//frid = frindrights id 1 = admin, 2 = control, 3 = view
const deleteUserInHome = async (memberID, RequestID, homeID) => {
    try {
        const sql = `
     DELETE FROM friends AS hm_target
    USING friends AS hm_req
    WHERE hm_target.friend_id = hm_req.friend_id
      AND hm_target.member_id = ?
      AND hm_target.friend_id = ?
      AND hm_req.member_id = ?
      AND hm_req.frid = 1;
    `;
        await db.remove(sql, [memberID, homeID, RequestID]);
        return { success: true, error: null };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

const getRoleInformation = async (memberID, homeID) => {
    try {
        const sql = `select  frid as role  from friends f  where f.friend_id = ? and f.member_id = ?`;
        const result = await db.select(sql, [homeID, memberID]);
        if (result.length === 0) {
            return { success: false, error: "User is not a member of the home" };
        }
        return { success: true, response: result, error: null };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

const changeUsername = async (memberID, newUsername) => {
    try {
        const sql = `
      UPDATE "member" m SET username = ? WHERE m.memberid = ?
    `;
        await db.update(sql, [newUsername, memberID]);
        return { success: true, error: null };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

const changeMemberName = async (memberID, newMemberName) => {
    try {
        const sql = `
      UPDATE "member" m SET membername = ? WHERE m.memberid = ?
    `;
        await db.update(sql, [newMemberName, memberID]);
        return { success: true, error: null };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

const changeUserPassword = async (memberID, newPassword) => {
    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        const sql = `
      UPDATE "member" m SET password = ? WHERE m.memberid = ?
    `;
        await db.update(sql, [hashedPassword, memberID]);
        return { success: true, error: null };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

const addmapfriendly = async (MemberID, HomeID, Role) => {
    try {
        const sql = `
          INSERT INTO friends (member_id, friend_id, frid)
            SELECT ?, ?, ?
            FROM member m
            WHERE m.memberid = ?
              AND m.devicetype = 1
            ON CONFLICT (member_id, friend_id)
            DO NOTHING
            RETURNING *;
      `;
        const result = await db.insert(sql, [MemberID, HomeID, Role, MemberID]);
        return { success: true, response: result, error: null };
    } catch (err) {
        return { success: false, error: err.message };
    }
};


const changeHomename = async (MemberID, frindid, Name) => {
    try {
        const sql = `
           UPDATE public."member" m_target
      SET membername = ?
      FROM public.friends f
      WHERE f.friend_id = m_target.memberid
        AND f.member_id = ?
        AND f.friend_id = ?
        AND f.frid = 1
        AND m_target.devicetype = 2
      `;
        const result = await db.update(sql, [Name, MemberID, frindid ]);
        return { success: true, response: result, error: null };
    } catch (err) {
        return { success: false, error: err.message };
    }
};

module.exports = {
    userlogin,
    getFloorPlan,
    updateStateUser,
    deleteAccount,
    getFriendlistInHome,
    getFriendrolelist,
    deleteUserInHome,
    getRoleInformation,
    changeUsername,
    memberIDlogin,
    changeMemberName,
    changeUserPassword,
    addmapfriendly,
    changeHomename
};