import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { authenticate, registerConsumer } from '../services/authService.js';
import { repository } from '../repositories/index.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';

const router = Router();

const credentialLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.credentialMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RateLimited', message: 'Too many attempts. Please wait and try again.' },
});

router.post(
  '/register',
  credentialLimiter,
  asyncRoute(async (req, res) => {
    const result = await registerConsumer(req.body ?? {});
    res.status(201).json({
      account: result.account,
      token: result.token,
      expiresInSeconds: config.auth.jwtTtlSeconds,
    });
  }),
);

router.post(
  '/login',
  credentialLimiter,
  asyncRoute(async (req, res) => {
    const result = await authenticate(req.body ?? {});
    res.json({
      account: result.account,
      token: result.token,
      expiresInSeconds: config.auth.jwtTtlSeconds,
    });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    const account = await repository.accounts.findById(req.principal.accountId);
    res.json({ account });
  }),
);

export default router;
