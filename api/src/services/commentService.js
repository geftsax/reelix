import { repository } from '../repositories/index.js';
import { moderateText } from './moderationService.js';
import { bumpGeneration } from './cache.js';
import { getClipForViewer } from './clipService.js';
import { unprocessable } from '../utils/httpError.js';

export const listComments = async ({ principal, clipId, query = {} }) => {
  await getClipForViewer({ principal, clipId });

  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize, 10) || 20, 1), 50);

  return repository.comments.listByClip(clipId, { page, pageSize });
};

export const postComment = async ({ principal, clipId, body }) => {
  const text = String(body ?? '').trim();

  if (text.length < 2 || text.length > 1000) {
    throw unprocessable('The comment could not be accepted.', {
      body: 'A comment must be between 2 and 1000 characters.',
    });
  }

  await getClipForViewer({ principal, clipId });

  const moderation = await moderateText(text);

  const comment = await repository.comments.create({
    clipId,
    accountId: principal.accountId,
    body: text,
    moderationVerdict: moderation.verdict,
    moderationSeverity: moderation.severity,
    moderationCategory: moderation.category,
    isVisible: moderation.isVisible,
  });

  bumpGeneration();

  return { comment, moderation };
};

export const rateClip = async ({ principal, clipId, score }) => {
  const value = Number.parseInt(score, 10);

  if (!Number.isFinite(value) || value < 1 || value > 5) {
    throw unprocessable('The rating could not be accepted.', {
      score: 'A rating must be a whole number between 1 and 5.',
    });
  }

  await getClipForViewer({ principal, clipId });
  const result = await repository.ratings.upsert(clipId, principal.accountId, value);

  bumpGeneration();

  return result;
};

export const ownRating = async ({ principal, clipId }) =>
  repository.ratings.findForAccount(clipId, principal.accountId);
