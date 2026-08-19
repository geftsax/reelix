import sql from 'mssql';
import { config } from '../config.js';

let poolPromise = null;

const buildConfig = () => ({
  server: config.sql.server,
  database: config.sql.database,
  user: config.sql.user,
  password: config.sql.password,
  options: {
    encrypt: config.sql.encrypt,
    trustServerCertificate: false,
    enableArithAbort: true,
  },
  pool: {
    max: config.sql.poolMax,
    min: config.sql.poolMin,
    idleTimeoutMillis: 30_000,
  },
  connectionTimeout: config.sql.connectTimeoutMs,
  requestTimeout: config.sql.requestTimeoutMs,
});

export const getPool = async () => {
  if (!config.sql.server || !config.sql.database) {
    throw new Error(
      'Azure SQL is not configured. Set SQL_SERVER, SQL_DATABASE, SQL_USER and SQL_PASSWORD, or run with DATA_PROVIDER=memory.',
    );
  }

  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(buildConfig())
      .connect()
      .catch((error) => {
        poolPromise = null;
        throw error;
      });
  }

  return poolPromise;
};

export const closePool = async () => {
  if (!poolPromise) return;
  const pool = await poolPromise.catch(() => null);
  poolPromise = null;
  if (pool) await pool.close();
};

const TRANSIENT_CODES = new Set([
  'ETIMEOUT',
  'ESOCKET',
  'ECONNCLOSED',
  'ECONNRESET',
  'ELOGIN',
]);

const isTransient = (error) =>
  TRANSIENT_CODES.has(error?.code) ||
  [40613, 40197, 40501, 49918, 49919, 49920, 4060].includes(error?.number);

export const withRetry = async (operation, attempts = 3) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
};

export { sql };
