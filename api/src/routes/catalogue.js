import { Router } from 'express';
import { config } from '../config.js';
import { repository } from '../repositories/index.js';
import { dashboard } from '../services/clipService.js';
import { readThrough } from '../services/cache.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { sendCached } from '../utils/httpCache.js';

const router = Router();

router.get(
  '/dashboard',
  asyncRoute(async (req, res) => {
    const result = await dashboard({ principal: req.principal });
    sendCached(req, res, result, config.cache.dashboardTtlSeconds);
  }),
);

router.get(
  '/reference',
  asyncRoute(async (req, res) => {
    const result = await readThrough('reference', config.cache.lookupTtlSeconds, async () => {
      const [genres, ageRatings] = await Promise.all([
        repository.lookups.genres(),
        repository.lookups.ageRatings(),
      ]);
      return { genres, ageRatings };
    });

    sendCached(req, res, result, config.cache.lookupTtlSeconds);
  }),
);

export default router;
