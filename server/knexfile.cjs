const path = require("path");

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildConnection = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  return {
    host: process.env.DB_HOST ?? "localhost",
    port: parseNumber(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "nemtsvar_app",
  };
};

module.exports = {
  client: "mysql2",
  connection: buildConnection(),
  migrations: {
    directory: path.join(__dirname, "migrations"),
    extension: "cjs",
  },
  seeds: {
    directory: path.join(__dirname, "seeds"),
    extension: "cjs",
  },
};
