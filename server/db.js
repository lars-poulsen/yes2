import mysql from "mysql2/promise";

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
};

const buildSslConfig = () => {
  const sslEnabled = parseBoolean(process.env.DB_SSL, false);
  if (!sslEnabled) {
    return undefined;
  }

  const sslConfig = {
    rejectUnauthorized: parseBoolean(
      process.env.DB_SSL_REJECT_UNAUTHORIZED,
      true
    ),
  };

  if (process.env.DB_SSL_CA) {
    sslConfig.ca = process.env.DB_SSL_CA;
  }

  return sslConfig;
};

const buildPoolConfig = () => {
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

const createPool = () => {
  const baseConfig = buildPoolConfig();
  const ssl = buildSslConfig();
  const poolConfig =
    typeof baseConfig === "string" ? { uri: baseConfig } : baseConfig;

  return mysql.createPool({
    ...poolConfig,
    ...(ssl ? { ssl } : {}),
    waitForConnections: true,
    connectionLimit: parseNumber(process.env.DB_POOL_MAX, 10),
    connectTimeout: parseNumber(process.env.DB_CONNECTION_TIMEOUT_MS, 2000),
  });
};

const pool = createPool();

const runQuery = async (sql, params) => pool.execute(sql, params);

const db = {
  async get(sql, ...params) {
    const [rows] = await runQuery(sql, params);
    return rows[0] ?? null;
  },
  async all(sql, ...params) {
    const [rows] = await runQuery(sql, params);
    return rows;
  },
  async run(sql, ...params) {
    return runQuery(sql, params);
  },
};

export const getDb = () => db;
