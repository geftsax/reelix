import {
  toAccountDto,
  toAccountWithSecret,
  toAgeRatingDto,
  toClipDto,
  toCommentDto,
  toGenreDto,
} from './mappers.js';

const AGE_RATINGS = [
  { AgeRatingCode: 'U', RatingLabel: 'Universal - suitable for all', MinimumAge: 0, DisplayOrder: 1 },
  { AgeRatingCode: 'PG', RatingLabel: 'Parental Guidance', MinimumAge: 8, DisplayOrder: 2 },
  { AgeRatingCode: '12', RatingLabel: 'Suitable for 12 years and over', MinimumAge: 12, DisplayOrder: 3 },
  { AgeRatingCode: '15', RatingLabel: 'Suitable for 15 years and over', MinimumAge: 15, DisplayOrder: 4 },
  { AgeRatingCode: '18', RatingLabel: 'Adults only', MinimumAge: 18, DisplayOrder: 5 },
];

const GENRES = [
  { GenreCode: 'music', GenreName: 'Music' },
  { GenreCode: 'comedy', GenreName: 'Comedy' },
  { GenreCode: 'education', GenreName: 'Education' },
  { GenreCode: 'sport', GenreName: 'Sport' },
  { GenreCode: 'technology', GenreName: 'Technology' },
  { GenreCode: 'travel', GenreName: 'Travel' },
  { GenreCode: 'food', GenreName: 'Food' },
  { GenreCode: 'gaming', GenreName: 'Gaming' },
  { GenreCode: 'news', GenreName: 'News & Current Affairs' },
  { GenreCode: 'lifestyle', GenreName: 'Lifestyle' },
];

const store = {
  accounts: [],
  clips: [],
  comments: [],
  ratings: [],
  viewEvents: [],
  sequences: { account: 0, clip: 0, comment: 0, viewEvent: 0 },
};

const nextId = (key) => {
  store.sequences[key] += 1;
  return store.sequences[key];
};

const nowIso = () => new Date().toISOString();

export const resetMemoryStore = () => {
  store.accounts = [];
  store.clips = [];
  store.comments = [];
  store.ratings = [];
  store.viewEvents = [];
  store.sequences = { account: 0, clip: 0, comment: 0, viewEvent: 0 };
};

const summarise = (clip) => {
  const genre = GENRES.find((g) => g.GenreCode === clip.GenreCode);
  const rating = AGE_RATINGS.find((a) => a.AgeRatingCode === clip.AgeRatingCode);
  const owner = store.accounts.find((a) => a.AccountId === clip.OwnerAccountId);
  const clipRatings = store.ratings.filter((r) => r.ClipId === clip.ClipId);
  const visibleComments = store.comments.filter((c) => c.ClipId === clip.ClipId && c.IsVisible);

  const average = clipRatings.length
    ? Number(
        (clipRatings.reduce((sum, r) => sum + r.RatingScore, 0) / clipRatings.length).toFixed(2),
      )
    : 0;

  return {
    ...clip,
    GenreName: genre?.GenreName ?? clip.GenreCode,
    AgeRatingLabel: rating?.RatingLabel ?? clip.AgeRatingCode,
    MinimumAge: rating?.MinimumAge ?? 0,
    OwnerDisplayName: owner?.DisplayName ?? 'Unknown',
    OwnerChannelName: owner?.ChannelName ?? null,
    RatingCount: clipRatings.length,
    AverageRating: average,
    CommentCount: visibleComments.length,
  };
};

const matchesTerm = (summary, term) => {
  if (!term) return true;
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return [
    summary.ClipTitle,
    summary.Synopsis,
    summary.Publisher,
    summary.Producer,
    summary.GenreName,
    summary.OwnerDisplayName,
  ]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
};

const accounts = {
  async findByEmail(emailAddress) {
    const row = store.accounts.find(
      (a) => a.EmailAddress.toLowerCase() === String(emailAddress).toLowerCase(),
    );
    return toAccountWithSecret(row);
  },

  async findById(accountId) {
    return toAccountDto(store.accounts.find((a) => a.AccountId === Number(accountId)));
  },

  async create({ emailAddress, displayName, passwordHash, role, channelName, birthYear }) {
    if (await accounts.findByEmail(emailAddress)) {
      const error = new Error('Violation of UNIQUE KEY constraint UQ_Account_Email');
      error.number = 2627;
      throw error;
    }
    const row = {
      AccountId: nextId('account'),
      EmailAddress: emailAddress,
      DisplayName: displayName,
      PasswordHash: passwordHash,
      AccountRole: role,
      ChannelName: channelName ?? null,
      BirthYear: birthYear ?? null,
      IsActive: true,
      CreatedUtc: nowIso(),
      LastLoginUtc: null,
    };
    store.accounts.push(row);
    return toAccountDto(row);
  },

  async touchLogin(accountId) {
    const row = store.accounts.find((a) => a.AccountId === Number(accountId));
    if (row) row.LastLoginUtc = nowIso();
  },

  async setRole({ emailAddress, role, channelName }) {
    const row = store.accounts.find(
      (a) => a.EmailAddress.toLowerCase() === String(emailAddress).toLowerCase(),
    );
    if (!row) return null;
    row.AccountRole = role;
    if (channelName) row.ChannelName = channelName;
    return toAccountDto(row);
  },

  async list() {
    return [...store.accounts]
      .sort((a, b) => String(b.CreatedUtc).localeCompare(String(a.CreatedUtc)))
      .map(toAccountDto);
  },
};

const lookups = {
  async genres() {
    return GENRES.map(toGenreDto);
  },
  async ageRatings() {
    return [...AGE_RATINGS].sort((a, b) => a.DisplayOrder - b.DisplayOrder).map(toAgeRatingDto);
  },
};

const clips = {
  async create(clip) {
    const row = {
      ClipId: nextId('clip'),
      OwnerAccountId: Number(clip.ownerAccountId),
      ClipTitle: clip.title,
      Synopsis: clip.synopsis ?? null,
      Publisher: clip.publisher,
      Producer: clip.producer,
      GenreCode: clip.genreCode,
      AgeRatingCode: clip.ageRatingCode,
      BlobName: clip.blobName,
      ContentType: clip.contentType,
      SizeBytes: Number(clip.sizeBytes),
      DurationSeconds: clip.durationSeconds ?? null,
      ViewCount: 0,
      PosterSeed: clip.posterSeed ?? 0,
      PublishState: 'published',
      PublishedUtc: nowIso(),
    };
    store.clips.push(row);
    return toClipDto(summarise(row));
  },

  async getById(clipId) {
    const row = store.clips.find((c) => c.ClipId === Number(clipId));
    return row ? toClipDto(summarise(row)) : null;
  },

  async search({
    term = null,
    genreCode = null,
    ageRatingCode = null,
    maxMinimumAge = null,
    sortBy = 'recent',
    page = 1,
    pageSize = 12,
  } = {}) {
    const size = Math.min(Math.max(pageSize, 1), 48);
    const matches = store.clips
      .map(summarise)
      .filter((s) => s.PublishState === 'published')
      .filter((s) => (genreCode ? s.GenreCode === genreCode : true))
      .filter((s) => (ageRatingCode ? s.AgeRatingCode === ageRatingCode : true))
      .filter((s) => (maxMinimumAge === null ? true : s.MinimumAge <= maxMinimumAge))
      .filter((s) => matchesTerm(s, term));

    matches.sort((a, b) => {
      if (sortBy === 'popular' && b.ViewCount !== a.ViewCount) return b.ViewCount - a.ViewCount;
      if (sortBy === 'rated' && b.AverageRating !== a.AverageRating) {
        return b.AverageRating - a.AverageRating;
      }
      const byDate = String(b.PublishedUtc).localeCompare(String(a.PublishedUtc));
      return byDate !== 0 ? byDate : b.ClipId - a.ClipId;
    });

    const offset = (Math.max(page, 1) - 1) * size;
    return {
      items: matches.slice(offset, offset + size).map(toClipDto),
      total: matches.length,
      page,
      pageSize: size,
    };
  },

  async dashboard({ maxMinimumAge = null, latestCount = 12, trendingCount = 6 } = {}) {
    const visible = store.clips
      .map(summarise)
      .filter((s) => s.PublishState === 'published')
      .filter((s) => (maxMinimumAge === null ? true : s.MinimumAge <= maxMinimumAge));

    const latest = [...visible]
      .sort((a, b) => String(b.PublishedUtc).localeCompare(String(a.PublishedUtc)) || b.ClipId - a.ClipId)
      .slice(0, latestCount)
      .map(toClipDto);

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const trending = [...visible]
      .map((s) => ({
        ...s,
        RecentViews: store.viewEvents.filter(
          (v) => v.ClipId === s.ClipId && new Date(v.ViewedUtc).getTime() >= cutoff,
        ).length,
      }))
      .sort(
        (a, b) =>
          b.RecentViews - a.RecentViews ||
          b.ViewCount - a.ViewCount ||
          String(b.PublishedUtc).localeCompare(String(a.PublishedUtc)),
      )
      .slice(0, trendingCount)
      .map(toClipDto);

    return { latest, trending };
  },

  async listByOwner(ownerAccountId) {
    return store.clips
      .filter((c) => c.OwnerAccountId === Number(ownerAccountId))
      .map(summarise)
      .sort((a, b) => String(b.PublishedUtc).localeCompare(String(a.PublishedUtc)) || b.ClipId - a.ClipId)
      .map(toClipDto);
  },

  async registerView(clipId, accountId = null) {
    const row = store.clips.find((c) => c.ClipId === Number(clipId));
    if (!row) return 0;
    row.ViewCount += 1;
    store.viewEvents.push({
      ViewEventId: nextId('viewEvent'),
      ClipId: row.ClipId,
      AccountId: accountId === null || accountId === undefined ? null : Number(accountId),
      ViewedUtc: nowIso(),
    });
    return row.ViewCount;
  },

  async setPublishState(clipId, ownerAccountId, publishState) {
    const row = store.clips.find(
      (c) => c.ClipId === Number(clipId) && c.OwnerAccountId === Number(ownerAccountId),
    );
    if (!row) return false;
    row.PublishState = publishState;
    return true;
  },
};

const comments = {
  async listByClip(clipId, { page = 1, pageSize = 20 } = {}) {
    const matches = store.comments
      .filter((c) => c.ClipId === Number(clipId) && c.IsVisible)
      .sort((a, b) => String(b.PostedUtc).localeCompare(String(a.PostedUtc)) || b.CommentId - a.CommentId);

    const offset = (Math.max(page, 1) - 1) * pageSize;
    const slice = matches.slice(offset, offset + pageSize).map((row) => {
      const author = store.accounts.find((a) => a.AccountId === row.AccountId);
      return toCommentDto({ ...row, AuthorDisplayName: author?.DisplayName });
    });

    return { items: slice, total: matches.length, page, pageSize };
  },

  async create({
    clipId,
    accountId,
    body,
    moderationVerdict = 'allowed',
    moderationSeverity = 0,
    moderationCategory = null,
    isVisible = true,
  }) {
    const row = {
      CommentId: nextId('comment'),
      ClipId: Number(clipId),
      AccountId: Number(accountId),
      CommentBody: body,
      ModerationVerdict: moderationVerdict,
      ModerationSeverity: moderationSeverity,
      ModerationCategory: moderationCategory,
      IsVisible: isVisible,
      PostedUtc: nowIso(),
    };
    store.comments.push(row);
    const author = store.accounts.find((a) => a.AccountId === row.AccountId);
    return toCommentDto({ ...row, AuthorDisplayName: author?.DisplayName });
  },
};

const ratings = {
  async upsert(clipId, accountId, score) {
    const existing = store.ratings.find(
      (r) => r.ClipId === Number(clipId) && r.AccountId === Number(accountId),
    );
    if (existing) {
      existing.RatingScore = score;
      existing.RatedUtc = nowIso();
    } else {
      store.ratings.push({
        ClipId: Number(clipId),
        AccountId: Number(accountId),
        RatingScore: score,
        RatedUtc: nowIso(),
      });
    }

    const clipRatings = store.ratings.filter((r) => r.ClipId === Number(clipId));
    const average = clipRatings.length
      ? Number(
          (clipRatings.reduce((sum, r) => sum + r.RatingScore, 0) / clipRatings.length).toFixed(2),
        )
      : 0;

    return { ratingCount: clipRatings.length, averageRating: average, yourScore: score };
  },

  async findForAccount(clipId, accountId) {
    const row = store.ratings.find(
      (r) => r.ClipId === Number(clipId) && r.AccountId === Number(accountId),
    );
    return row ? row.RatingScore : null;
  },
};

const diagnostics = {
  async ping() {
    return { provider: 'in-memory', latencyMs: 0 };
  },
};

export const memoryRepository = {
  name: 'in-memory',
  accounts,
  lookups,
  clips,
  comments,
  ratings,
  diagnostics,
};
