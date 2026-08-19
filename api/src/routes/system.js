import { Router } from 'express';
import { config } from '../config.js';
import { describeProvider, repository } from '../repositories/index.js';
import { cacheStats } from '../services/cache.js';
import { moderationInfo } from '../services/moderationService.js';
import { storageInfo } from '../services/storageService.js';
import { snapshot } from '../services/metrics.js';
import { asyncRoute } from '../utils/asyncRoute.js';

const router = Router();

router.get(
  '/health',
  asyncRoute(async (_req, res) => {
    const startedAt = Date.now();
    let database = { status: 'unknown' };

    try {
      const ping = await repository.diagnostics.ping();
      database = { status: 'up', ...ping };
    } catch (error) {
      database = { status: 'down', message: error.message };
    }

    const healthy = database.status === 'up';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'degraded',
      service: config.appName,
      environment: config.env,
      checkedInMs: Date.now() - startedAt,
      dependencies: {
        database,
        storage: storageInfo(),
        moderation: moderationInfo(),
      },
    });
  }),
);

router.get('/metrics', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...snapshot(), cacheState: cacheStats() });
});

router.get('/info', (_req, res) => {
  res.json({
    service: config.appName,
    environment: config.env,
    node: process.version,
    dataProvider: describeProvider(),
    storage: storageInfo(),
    moderation: moderationInfo(),
    limits: {
      maxUploadMegabytes: config.upload.maxMegabytes,
      allowedUploadTypes: config.upload.allowedTypes,
      rateLimitPerMinute: config.rateLimit.maxRequests,
    },
    cacheTtlSeconds: {
      dashboard: config.cache.dashboardTtlSeconds,
      search: config.cache.searchTtlSeconds,
      reference: config.cache.lookupTtlSeconds,
    },
  });
});

export default router;
