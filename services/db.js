const { Sequelize } = require("sequelize");

const DIALECT_MAP = {
  mysql: "mysql",
  mariadb: "mariadb",
  postgres: "postgres",
  timescale: "postgres",
  mssql: "mssql"
};

const dialect = DIALECT_MAP[process.env.DB_DIALECT];

if (!dialect) {
  throw new Error("Unsupported DB_DIALECT");
}

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    dialect,
    logging: process.env.DB_LOGGING === "true",
    dialectOptions:
      process.env.DB_SSL === "true"
        ? { ssl: { require: true, rejectUnauthorized: false } }
        : {},
    pool: {
      max: 10,
      min: 0,
      idle: 10000,
      acquire: 30000
    }
  }
);

module.exports = { sequelize };

/*-----------------------------------------------------------
$env:PGUSER="postgres"
$env:PGHOST="localhost"
$env:PGPORT="5432"
psql -W -d postgres
*/