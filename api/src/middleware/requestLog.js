import { performance } from 'node:perf_hooks';
import { recordRequest } from '../services/metrics.js';

export const requestLog = (req, res, next) => {
  const startedAt = performance.now();

  res.on('finish', () => {
    const durationMs = performance.now() - startedAt;
    const routePattern = req.route?.path
      ? `${req.method} ${req.baseUrl}${req.route.path}`
      : `${req.method} ${req.path}`;

    recordRequest({
      route: routePattern,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
};
