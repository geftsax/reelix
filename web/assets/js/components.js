import { el, formatDuration, posterStyle, relativeTime, starString } from './ui.js';

const compactCount = (value) => {
  const count = Number(value) || 0;
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}m`;
};

export const clipCard = (clip) =>
  el('a', { class: 'clip-card', href: `#/watch/${clip.clipId}` }, [
    el('div', { class: 'poster' }, [
      el('div', { class: 'poster-art', style: posterStyle(clip.posterSeed) }),
      el('span', { class: 'poster-badge' }, clip.ageRatingCode),
      clip.durationSeconds
        ? el('span', { class: 'poster-duration' }, formatDuration(clip.durationSeconds))
        : null,
      el('span', { class: 'poster-play', 'aria-hidden': 'true' }),
    ]),
    el('div', { class: 'clip-body' }, [
      el('h3', { class: 'clip-title' }, clip.title),
      el('div', { class: 'clip-channel' }, clip.owner?.channelName || clip.owner?.displayName || 'Unknown channel'),
      el('div', { class: 'clip-stats' }, [
        el('span', {}, clip.genreName),
        el('span', { class: 'rule' }, '/'),
        el('span', {}, `${compactCount(clip.viewCount)} views`),
        el('span', { class: 'rule' }, '/'),
        el('span', {}, relativeTime(clip.publishedUtc)),
        clip.ratingCount
          ? el('span', { class: 'stars', title: `${Number(clip.averageRating).toFixed(1)} out of 5` },
              starString(clip.averageRating))
          : null,
      ]),
    ]),
  ]);

export const clipGrid = (clips, emptyTitle, emptyBody) => {
  if (!clips?.length) return emptyState(emptyTitle, emptyBody);
  return el('div', { class: 'clip-grid' }, clips.map(clipCard));
};

export const emptyState = (title, body) =>
  el('div', { class: 'empty' }, [el('strong', {}, title), body ?? null]);

export const sectionHead = (title, trailing) =>
  el('div', { class: 'section-head' }, [el('h2', {}, title), trailing ?? null]);

export const statTile = (label, value) =>
  el('div', { class: 'stat' }, [
    el('div', { class: 'stat-value' }, String(value)),
    el('div', { class: 'stat-label' }, label),
  ]);

export const loading = (message = 'Loading…') => el('div', { class: 'loading' }, message);

export const errorPanel = (message) =>
  el('div', { class: 'empty', style: 'border-left-color:var(--bad)' }, [
    el('strong', {}, 'That did not work'),
    message,
  ]);
