import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  getClipForViewer,
  getPlayback,
  listOwnLibrary,
  publishClip,
  searchClips,
  setPublishState,
} from '../services/clipService.js';
import { listComments, ownRating, postComment, rateClip } from '../services/commentService.js';
import { asyncRoute } from '../utils/asyncRoute.js';
import { sendCached } from '../utils/httpCache.js';
import { badRequest } from '../utils/httpError.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.upload.maxMegabytes * 1024 * 1024,
    files: 1,
  },
});

const clipIdOf = (req) => {
  const clipId = Number.parseInt(req.params.clipId, 10);
  if (!Number.isFinite(clipId) || clipId < 1) throw badRequest('Invalid clip identifier.');
  return clipId;
};

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const result = await searchClips({ principal: req.principal, query: req.query });
    sendCached(req, res, result, config.cache.searchTtlSeconds);
  }),
);

router.get(
  '/library',
  requireRole('creator', 'admin'),
  asyncRoute(async (req, res) => {
    const clips = await listOwnLibrary(req.principal);
    res.json({ items: clips, total: clips.length });
  }),
);

router.post(
  '/',
  requireRole('creator', 'admin'),
  upload.single('video'),
  asyncRoute(async (req, res) => {
    const clip = await publishClip({
      principal: req.principal,
      file: req.file,
      metadata: req.body ?? {},
    });
    res.status(201).json({ clip });
  }),
);

router.get(
  '/:clipId',
  asyncRoute(async (req, res) => {
    const clip = await getClipForViewer({ principal: req.principal, clipId: clipIdOf(req) });
    res.json({ clip });
  }),
);

router.get(
  '/:clipId/playback',
  requireAuth,
  asyncRoute(async (req, res) => {
    const playback = await getPlayback({ principal: req.principal, clipId: clipIdOf(req) });
    res.set('Cache-Control', 'no-store');
    res.json(playback);
  }),
);

router.patch(
  '/:clipId/state',
  requireRole('creator', 'admin'),
  asyncRoute(async (req, res) => {
    const result = await setPublishState({
      principal: req.principal,
      clipId: clipIdOf(req),
      publishState: req.body?.publishState,
    });
    res.json(result);
  }),
);

router.get(
  '/:clipId/comments',
  asyncRoute(async (req, res) => {
    const result = await listComments({
      principal: req.principal,
      clipId: clipIdOf(req),
      query: req.query,
    });
    res.set('Cache-Control', 'no-store');
    res.json(result);
  }),
);

router.post(
  '/:clipId/comments',
  requireAuth,
  asyncRoute(async (req, res) => {
    const result = await postComment({
      principal: req.principal,
      clipId: clipIdOf(req),
      body: req.body?.body,
    });

    res.status(result.moderation.verdict === 'blocked' ? 202 : 201).json({
      comment: result.moderation.isVisible ? result.comment : null,
      moderation: {
        verdict: result.moderation.verdict,
        category: result.moderation.category,
        severity: result.moderation.severity,
        source: result.moderation.source,
        message: result.moderation.message,
      },
    });
  }),
);

router.put(
  '/:clipId/rating',
  requireAuth,
  asyncRoute(async (req, res) => {
    const result = await rateClip({
      principal: req.principal,
      clipId: clipIdOf(req),
      score: req.body?.score,
    });
    res.json(result);
  }),
);

router.get(
  '/:clipId/rating',
  requireAuth,
  asyncRoute(async (req, res) => {
    const score = await ownRating({ principal: req.principal, clipId: clipIdOf(req) });
    res.set('Cache-Control', 'no-store');
    res.json({ clipId: clipIdOf(req), yourScore: score });
  }),
);

export default router;
