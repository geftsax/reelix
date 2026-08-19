const MAX_LATENCY_SAMPLES = 500;

const state = {
  startedAt: Date.now(),
  requests: { total: 0, byStatusClass: {}, byRoute: {} },
  latencySamplesMs: [],
  cache: { hits: 0, misses: 0, evictions: 0 },
  moderation: { calls: 0, allowed: 0, flagged: 0, blocked: 0, skipped: 0, failures: 0 },
  storage: { uploads: 0, uploadedBytes: 0, sasIssued: 0, failures: 0 },
  database: { failures: 0 },
};

export const recordRequest = ({ route, statusCode, durationMs }) => {
  state.requests.total += 1;

  const statusClass = `${Math.floor(statusCode / 100)}xx`;
  state.requests.byStatusClass[statusClass] = (state.requests.byStatusClass[statusClass] ?? 0) + 1;

  const key = route || 'unmatched';
  const bucket = state.requests.byRoute[key] ?? { count: 0, totalMs: 0, maxMs: 0 };
  bucket.count += 1;
  bucket.totalMs += durationMs;
  bucket.maxMs = Math.max(bucket.maxMs, durationMs);
  state.requests.byRoute[key] = bucket;

  state.latencySamplesMs.push(durationMs);
  if (state.latencySamplesMs.length > MAX_LATENCY_SAMPLES) state.latencySamplesMs.shift();
};

export const recordCacheHit = () => {
  state.cache.hits += 1;
};
export const recordCacheMiss = () => {
  state.cache.misses += 1;
};
export const recordCacheEviction = () => {
  state.cache.evictions += 1;
};

export const recordModeration = (verdict, { failed = false } = {}) => {
  state.moderation.calls += 1;
  if (failed) state.moderation.failures += 1;
  if (verdict && state.moderation[verdict] !== undefined) state.moderation[verdict] += 1;
};

export const recordUpload = (bytes) => {
  state.storage.uploads += 1;
  state.storage.uploadedBytes += bytes;
};
export const recordSasIssued = () => {
  state.storage.sasIssued += 1;
};
export const recordStorageFailure = () => {
  state.storage.failures += 1;
};
export const recordDatabaseFailure = () => {
  state.database.failures += 1;
};

const percentile = (samples, fraction) => {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(fraction * sorted.length));
  return Math.round(sorted[index]);
};

export const snapshot = () => {
  const samples = state.latencySamplesMs;
  const cacheTotal = state.cache.hits + state.cache.misses;

  const slowestRoutes = Object.entries(state.requests.byRoute)
    .map(([route, bucket]) => ({
      route,
      count: bucket.count,
      averageMs: Math.round(bucket.totalMs / bucket.count),
      maxMs: Math.round(bucket.maxMs),
    }))
    .sort((a, b) => b.averageMs - a.averageMs)
    .slice(0, 8);

  return {
    uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000),
    requests: {
      total: state.requests.total,
      byStatusClass: { ...state.requests.byStatusClass },
    },
    latencyMs: {
      samples: samples.length,
      average: samples.length
        ? Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length)
        : 0,
      p50: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      p99: percentile(samples, 0.99),
    },
    cache: {
      ...state.cache,
      hitRatio: cacheTotal ? Number((state.cache.hits / cacheTotal).toFixed(3)) : 0,
    },
    moderation: { ...state.moderation },
    storage: { ...state.storage },
    database: { ...state.database },
    slowestRoutes,
  };
};

export const resetMetrics = () => {
  state.startedAt = Date.now();
  state.requests = { total: 0, byStatusClass: {}, byRoute: {} };
  state.latencySamplesMs = [];
  state.cache = { hits: 0, misses: 0, evictions: 0 };
  state.moderation = { calls: 0, allowed: 0, flagged: 0, blocked: 0, skipped: 0, failures: 0 };
  state.storage = { uploads: 0, uploadedBytes: 0, sasIssued: 0, failures: 0 };
  state.database = { failures: 0 };
};
