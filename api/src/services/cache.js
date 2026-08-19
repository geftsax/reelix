import { config } from '../config.js';
import { recordCacheEviction, recordCacheHit, recordCacheMiss } from './metrics.js';

const entries = new Map();
// Bumped on every write so stale entries fall out without tracking keys.
let generation = 1;

const evictOldest = () => {
  const oldestKey = entries.keys().next().value;
  if (oldestKey !== undefined) {
    entries.delete(oldestKey);
    recordCacheEviction();
  }
};

export const bumpGeneration = () => {
  generation += 1;
  entries.clear();
  return generation;
};

export const currentGeneration = () => generation;

export const readThrough = async (key, ttlSecs, loader) => {
  const scopedKey = `g${generation}:${key}`;
  const hit = entries.get(scopedKey);

  if (hit && hit.expiresAt > Date.now()) {
    recordCacheHit();
    return { value: hit.value, cached: true, etag: hit.etag };
  }

  if (hit) entries.delete(scopedKey);
  recordCacheMiss();

  const value = await loader();
  const etag = `W/"${generation}-${hashKey(scopedKey)}-${Date.now().toString(36)}"`;

  if (entries.size >= config.cache.maxEntries) evictOldest();
  entries.set(scopedKey, { value, etag, expiresAt: Date.now() + ttlSecs * 1000 });

  return { value, cached: false, etag };
};

const hashKey = (input) => {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
};

export const cacheStats = () => ({
  generation,
  entries: entries.size,
  maxEntries: config.cache.maxEntries,
});

export const clearCache = () => {
  entries.clear();
};
