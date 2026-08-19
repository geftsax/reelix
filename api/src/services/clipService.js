import { config } from '../config.js';
import { repository } from '../repositories/index.js';
import { bumpGeneration, readThrough } from './cache.js';
import { buildBlobName, storage } from './storageService.js';
import { maxMinimumAgeFor } from './authService.js';
import { badRequest, forbidden, notFound, unprocessable } from '../utils/httpError.js';

const SORTS = ['recent', 'popular', 'rated'];

export const validateClipMetadata = async (payload) => {
  const errors = {};

  const title = String(payload.title ?? '').trim();
  const publisher = String(payload.publisher ?? '').trim();
  const producer = String(payload.producer ?? '').trim();
  const genreCode = String(payload.genreCode ?? '').trim();
  const ageRatingCode = String(payload.ageRatingCode ?? '').trim();
  const synopsis = String(payload.synopsis ?? '').trim();

  if (title.length < 3 || title.length > 160) errors.title = 'Title must be 3-160 characters.';
  if (publisher.length < 2 || publisher.length > 120) errors.publisher = 'Publisher is required.';
  if (producer.length < 2 || producer.length > 120) errors.producer = 'Producer is required.';
  if (synopsis.length > 1000) errors.synopsis = 'Synopsis must be 1000 characters or fewer.';

  const [genres, ageRatings] = await Promise.all([
    repository.lookups.genres(),
    repository.lookups.ageRatings(),
  ]);

  if (!genres.some((genre) => genre.genreCode === genreCode)) {
    errors.genreCode = 'Select a genre from the published list.';
  }
  if (!ageRatings.some((rating) => rating.ageRatingCode === ageRatingCode)) {
    errors.ageRatingCode = 'Select an age rating from the published list.';
  }

  let durationSeconds = null;
  if (payload.durationSeconds !== undefined && payload.durationSeconds !== '') {
    durationSeconds = Number.parseInt(payload.durationSeconds, 10);
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0 || durationSeconds > 86_400) {
      errors.durationSeconds = 'Duration must be a positive number of seconds.';
    }
  }

  if (Object.keys(errors).length) {
    throw unprocessable('The clip metadata could not be accepted.', errors);
  }

  return {
    title,
    publisher,
    producer,
    genreCode,
    ageRatingCode,
    synopsis: synopsis || null,
    durationSeconds,
  };
};

const posterSeedFor = (title) => {
  let hash = 7;
  for (let index = 0; index < title.length; index += 1) {
    hash = (hash * 31 + title.charCodeAt(index)) % 360;
  }
  return hash;
};

export const publishClip = async ({ principal, file, metadata }) => {
  if (!file) throw badRequest('A video file is required.');

  if (!config.upload.allowedTypes.includes(file.mimetype)) {
    throw unprocessable('That file type is not supported.', {
      file: `Allowed types: ${config.upload.allowedTypes.join(', ')}.`,
    });
  }

  const details = await validateClipMetadata(metadata);
  const blobName = buildBlobName(principal.accountId, file.originalname, file.mimetype);

  const stored = await storage.upload({
    blobName,
    buffer: file.buffer,
    contentType: file.mimetype,
  });

  const clip = await repository.clips.create({
    ownerAccountId: principal.accountId,
    ...details,
    blobName: stored.blobName,
    contentType: file.mimetype,
    sizeBytes: stored.sizeBytes,
    posterSeed: posterSeedFor(details.title),
  });

  bumpGeneration();

  return clip;
};

export const searchClips = async ({ principal, query }) => {
  const term = query.q ? String(query.q).slice(0, 160) : null;
  const genreCode = query.genre ? String(query.genre) : null;
  const ageRatingCode = query.rating ? String(query.rating) : null;
  const sortBy = SORTS.includes(query.sort) ? query.sort : 'recent';
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize, 10) || 12, 1), 48);
  const maxMinimumAge = maxMinimumAgeFor(principal);

  const cacheKey = [
    'search',
    term ?? '',
    genreCode ?? '',
    ageRatingCode ?? '',
    sortBy,
    page,
    pageSize,
    maxMinimumAge ?? 'all',
  ].join('|');

  return readThrough(cacheKey, config.cache.searchTtlSeconds, () =>
    repository.clips.search({
      term,
      genreCode,
      ageRatingCode,
      maxMinimumAge,
      sortBy,
      page,
      pageSize,
    }),
  );
};

export const dashboard = async ({ principal }) => {
  const maxMinimumAge = maxMinimumAgeFor(principal);
  const cacheKey = `dashboard|${maxMinimumAge ?? 'all'}`;

  return readThrough(cacheKey, config.cache.dashboardTtlSeconds, () =>
    repository.clips.dashboard({ maxMinimumAge, latestCount: 12, trendingCount: 6 }),
  );
};

const ageAllows = (principal, clip) => {
  const cap = maxMinimumAgeFor(principal);
  if (cap === null) return true;
  return clip.minimumAge <= cap;
};

export const getClipForViewer = async ({ principal, clipId }) => {
  const clip = await repository.clips.getById(clipId);
  if (!clip) throw notFound('That clip does not exist.');

  const isOwner = principal && clip.owner.accountId === principal.accountId;
  if (clip.publishState !== 'published' && !isOwner && principal?.role !== 'admin') {
    throw notFound('That clip does not exist.');
  }

  if (!isOwner && !ageAllows(principal, clip)) {
    throw forbidden(
      `This clip is rated ${clip.ageRatingCode} and requires a viewer aged ${clip.minimumAge} or over.`,
    );
  }

  return clip;
};

export const getPlayback = async ({ principal, clipId }) => {
  const clip = await getClipForViewer({ principal, clipId });
  const playback = await storage.playbackUrl(clip.blobName);
  const viewCount = await repository.clips.registerView(clipId, principal?.accountId ?? null);

  return {
    clipId: clip.clipId,
    contentType: clip.contentType,
    playbackUrl: playback.url,
    expiresOn: playback.expiresOn,
    viewCount,
  };
};

export const listOwnLibrary = async (principal) => repository.clips.listByOwner(principal.accountId);

export const setPublishState = async ({ principal, clipId, publishState }) => {
  if (!['published', 'hidden'].includes(publishState)) {
    throw badRequest("publishState must be 'published' or 'hidden'.");
  }

  const updated = await repository.clips.setPublishState(clipId, principal.accountId, publishState);
  if (!updated) throw notFound('That clip does not exist on your channel.');

  bumpGeneration();
  return { clipId, publishState };
};
