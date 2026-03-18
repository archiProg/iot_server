// db_service.js
const { sequelize } = require("./db");

/* ----------------------------------------------------------
   INTERNAL EXECUTOR
----------------------------------------------------------- */
async function exec(sql, replacements = {}, options = {}) {
    try {
        const [result] = await sequelize.query(sql, {
            replacements,
            type: options.type || sequelize.QueryTypes.RAW,
            transaction: options.transaction || null
        });

        return result;
    } catch (err) {
        console.error("[DB ERROR]");
        console.error("SQL:", sql);
        console.error("PARAMS:", replacements);
        throw err;
    }
}

/* ----------------------------------------------------------
   SELECT
----------------------------------------------------------- */
async function select(sql, replacements = {}, options = {}) {
    return await sequelize.query(sql, {
        replacements,
        type: sequelize.QueryTypes.SELECT,
        transaction: options.transaction || null
    });
}

/* ----------------------------------------------------------
   INSERT
----------------------------------------------------------- */
async function insert(sql, replacements = {}, options = {}) {
    const [result] = await sequelize.query(sql, {
        replacements,
        type: sequelize.QueryTypes.INSERT,
        transaction: options.transaction || null
    });

    return result;
}

/* ----------------------------------------------------------
   UPDATE
----------------------------------------------------------- */
async function update(sql, replacements = {}, options = {}) {
    const [affected] = await sequelize.query(sql, {
        replacements,
        type: sequelize.QueryTypes.UPDATE,
        transaction: options.transaction || null
    });

    return affected;
}

/* ----------------------------------------------------------
   DELETE
----------------------------------------------------------- */
async function remove(sql, replacements = {}, options = {}) {
    const [affected] = await sequelize.query(sql, {
        replacements,
        type: sequelize.QueryTypes.DELETE,
        transaction: options.transaction || null
    });

    return affected;
}

/* ----------------------------------------------------------
   TRANSACTION WRAPPER
----------------------------------------------------------- */
async function transaction(callback) {
    const t = await sequelize.transaction();

    try {
        const result = await callback(t);
        await t.commit();
        return result;
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

/* ----------------------------------------------------------
   HEALTH CHECK
----------------------------------------------------------- */
async function ping() {
    await sequelize.authenticate();
    return "OK";
}
/* ----------------------------------------------------------
   Device Logs
----------------------------------------------------------- */
async function saveDeviceLog(device_id, payload, created_at = null, options = {}) {
    if (device_id === undefined || device_id === null || device_id === "") {
        throw new Error("saveDeviceLog: device_id is required");
    }
    if (!payload || typeof payload !== "object") {
        throw new Error("saveDeviceLog: payload must be an object");
    }

    const sql = `
    INSERT INTO iot_simple.device_logs (device_id, payload, created_at)
    VALUES (?, CAST(? AS jsonb), COALESCE(?, NOW()))
    RETURNING id;
  `;

    const replacements = [
        Number(device_id), JSON.stringify(payload), created_at ? created_at : null
    ];

    // exec() ของคุณ return result (แถวแรก/หรือ array) ขึ้นกับ dialect/QueryTypes
    const result = await exec(sql, replacements);

    // result อาจเป็น object {id:...} หรือ array [{id:...}]
    const row = Array.isArray(result) ? result[0] : result;
    if (!row || row.id === undefined || row.id === null) {
        throw new Error("saveDeviceLog: insert succeeded but no id returned");
    }

    return row.id;
}

module.exports = {
    exec,
    select,
    insert,
    update,
    remove,
    transaction,
    ping,
    saveDeviceLog
};
