import { Router } from 'express';
import { repository } from '../repositories/index.js';
import { createAccountWithRole } from '../services/authService.js';
import { requireRole } from '../middleware/auth.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { badRequest, notFound } from '../utils/httpError.js';

const router = Router();

router.use(requireRole('admin'));

router.get(
  '/accounts',
  asyncRoute(async (_req, res) => {
    const accounts = await repository.accounts.list();
    res.json({ items: accounts, total: accounts.length });
  }),
);

router.post(
  '/accounts',
  asyncRoute(async (req, res) => {
    const role = String(req.body?.role ?? 'creator');
    if (!['consumer', 'creator', 'admin'].includes(role)) {
      throw badRequest("role must be 'consumer', 'creator' or 'admin'.");
    }

    const account = await createAccountWithRole(req.body ?? {}, role);
    res.status(201).json({ account });
  }),
);

router.patch(
  '/accounts/role',
  asyncRoute(async (req, res) => {
    const emailAddress = String(req.body?.emailAddress ?? '').trim().toLowerCase();
    const role = String(req.body?.role ?? '');

    if (!emailAddress) throw badRequest('emailAddress is required.');
    if (!['consumer', 'creator', 'admin'].includes(role)) {
      throw badRequest("role must be 'consumer', 'creator' or 'admin'.");
    }

    const account = await repository.accounts.setRole({
      emailAddress,
      role,
      channelName: req.body?.channelName ?? null,
    });

    if (!account) throw notFound('No account exists for that email address.');
    res.json({ account });
  }),
);

export default router;
