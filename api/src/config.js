import 'dotenv/config';

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value, fallback = []) => {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 8080),
  appName: process.env.APP_NAME || 'Reelix',

  dataProvider: (process.env.DATA_PROVIDER || 'memory').toLowerCase(),

  sql: {
    server: process.env.SQL_SERVER || '',
    database: process.env.SQL_DATABASE || '',
    user: process.env.SQL_USER || '',
    password: process.env.SQL_PASSWORD || '',
    encrypt: bool(process.env.SQL_ENCRYPT, true),
    poolMax: int(process.env.SQL_POOL_MAX, 8),
    poolMin: int(process.env.SQL_POOL_MIN, 0),
    connectTimeoutMs: int(process.env.SQL_CONNECT_TIMEOUT_MS, 60000),
    requestTimeoutMs: int(process.env.SQL_REQUEST_TIMEOUT_MS, 45000),
  },

  storageProvider: (process.env.STORAGE_PROVIDER || 'local').toLowerCase(),

  storage: {
    accountName: process.env.STORAGE_ACCOUNT || '',
    accountKey: process.env.STORAGE_KEY || '',
    connectionString: process.env.STORAGE_CONNECTION_STRING || '',
    container: process.env.STORAGE_CONTAINER || 'clips',
    localRoot: process.env.STORAGE_LOCAL_ROOT || '.localstore',
    playbackSasMinutes: int(process.env.PLAYBACK_SAS_MINUTES, 30),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'reelix-dev-secret-change-me',
    jwtTtlSeconds: int(process.env.JWT_TTL_SECONDS, 60 * 60 * 8),
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, 10),
    minPasswordLength: int(process.env.MIN_PASSWORD_LENGTH, 8),
    unverifiedMaxMinimumAge: int(process.env.UNVERIFIED_MAX_AGE, 15),
  },

  moderation: {
    endpoint: process.env.CONTENT_SAFETY_ENDPOINT || '',
    key: process.env.CONTENT_SAFETY_KEY || '',
    apiVersion: process.env.CONTENT_SAFETY_API_VERSION || '2024-09-01',
    blockSeverity: int(process.env.CONTENT_SAFETY_BLOCK_SEVERITY, 4),
    flagSeverity: int(process.env.CONTENT_SAFETY_FLAG_SEVERITY, 2),
    timeoutMs: int(process.env.CONTENT_SAFETY_TIMEOUT_MS, 4000),
  },

  cache: {
    dashboardTtlSeconds: int(process.env.CACHE_DASHBOARD_TTL, 45),
    searchTtlSeconds: int(process.env.CACHE_SEARCH_TTL, 30),
    lookupTtlSeconds: int(process.env.CACHE_LOOKUP_TTL, 600),
    maxEntries: int(process.env.CACHE_MAX_ENTRIES, 500),
  },

  upload: {
    maxMegabytes: int(process.env.MAX_UPLOAD_MB, 64),
    allowedTypes: list(process.env.ALLOWED_UPLOAD_TYPES, [
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ]),
  },

  cors: {
    origins: list(process.env.CORS_ORIGINS, ['*']),
  },

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    maxRequests: int(process.env.RATE_LIMIT_MAX, 240),
    credentialMaxRequests: int(process.env.RATE_LIMIT_CREDENTIAL_MAX, 12),
  },
};

export const usingSql = () => config.dataProvider === 'sql';
export const usingAzureStorage = () => config.storageProvider === 'azure';
export const moderationEnabled = () =>
  Boolean(config.moderation.endpoint && config.moderation.key);
