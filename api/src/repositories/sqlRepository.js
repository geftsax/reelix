import { getPool, withRetry, sql } from '../db/pool.js';
import {
  toAccountDto,
  toAccountWithSecret,
  toAgeRatingDto,
  toClipDto,
  toCommentDto,
  toGenreDto,
} from './mappers.js';

const request = async () => {
  const pool = await getPool();
  return pool.request();
};

const nullable = (value) => (value === undefined || value === '' ? null : value);

const accounts = {
  async findByEmail(emailAddress) {
    return withRetry(async () => {
      const result = await (await request())
        .input('EmailAddress', sql.NVarChar(256), emailAddress)
        .query(
          `SELECT AccountId, EmailAddress, DisplayName, PasswordHash, AccountRole,
                  ChannelName, BirthYear, IsActive, CreatedUtc, LastLoginUtc
           FROM rx.Account
           WHERE EmailAddress = @EmailAddress`,
        );
      return toAccountWithSecret(result.recordset[0]);
    });
  },

  async findById(accountId) {
    return withRetry(async () => {
      const result = await (await request())
        .input('AccountId', sql.Int, accountId)
        .query(
          `SELECT AccountId, EmailAddress, DisplayName, PasswordHash, AccountRole,
                  ChannelName, BirthYear, IsActive, CreatedUtc, LastLoginUtc
           FROM rx.Account
           WHERE AccountId = @AccountId`,
        );
      return toAccountDto(result.recordset[0]);
    });
  },

  async create({ emailAddress, displayName, passwordHash, role, channelName, birthYear }) {
    return withRetry(async () => {
      const result = await (await request())
        .input('EmailAddress', sql.NVarChar(256), emailAddress)
        .input('DisplayName', sql.NVarChar(80), displayName)
        .input('PasswordHash', sql.NVarChar(256), passwordHash)
        .input('AccountRole', sql.NVarChar(16), role)
        .input('ChannelName', sql.NVarChar(120), nullable(channelName))
        .input('BirthYear', sql.Int, nullable(birthYear))
        .query(
          `INSERT INTO rx.Account (EmailAddress, DisplayName, PasswordHash, AccountRole, ChannelName, BirthYear)
           OUTPUT INSERTED.AccountId, INSERTED.EmailAddress, INSERTED.DisplayName,
                  INSERTED.AccountRole, INSERTED.ChannelName, INSERTED.BirthYear,
                  INSERTED.IsActive, INSERTED.CreatedUtc, INSERTED.LastLoginUtc
           VALUES (@EmailAddress, @DisplayName, @PasswordHash, @AccountRole, @ChannelName, @BirthYear)`,
        );
      return toAccountDto(result.recordset[0]);
    });
  },

  async touchLogin(accountId) {
    return withRetry(async () => {
      await (await request())
        .input('AccountId', sql.Int, accountId)
        .query('UPDATE rx.Account SET LastLoginUtc = SYSUTCDATETIME() WHERE AccountId = @AccountId');
    });
  },

  async setRole({ emailAddress, role, channelName }) {
    return withRetry(async () => {
      const result = await (await request())
        .input('EmailAddress', sql.NVarChar(256), emailAddress)
        .input('AccountRole', sql.NVarChar(16), role)
        .input('ChannelName', sql.NVarChar(120), nullable(channelName))
        .query(
          `UPDATE rx.Account
           SET AccountRole = @AccountRole,
               ChannelName = COALESCE(@ChannelName, ChannelName)
           OUTPUT INSERTED.AccountId, INSERTED.EmailAddress, INSERTED.DisplayName,
                  INSERTED.AccountRole, INSERTED.ChannelName, INSERTED.BirthYear,
                  INSERTED.IsActive, INSERTED.CreatedUtc, INSERTED.LastLoginUtc
           WHERE EmailAddress = @EmailAddress`,
        );
      return toAccountDto(result.recordset[0]);
    });
  },

  async list() {
    return withRetry(async () => {
      const result = await (await request()).query(
        `SELECT AccountId, EmailAddress, DisplayName, AccountRole, ChannelName,
                BirthYear, IsActive, CreatedUtc, LastLoginUtc
         FROM rx.Account
         ORDER BY CreatedUtc DESC`,
      );
      return result.recordset.map(toAccountDto);
    });
  },
};

const lookups = {
  async genres() {
    return withRetry(async () => {
      const result = await (await request()).query(
        'SELECT GenreCode, GenreName FROM rx.Genre WHERE IsActive = 1 ORDER BY GenreName',
      );
      return result.recordset.map(toGenreDto);
    });
  },

  async ageRatings() {
    return withRetry(async () => {
      const result = await (await request()).query(
        'SELECT AgeRatingCode, RatingLabel, MinimumAge, DisplayOrder FROM rx.AgeRating ORDER BY DisplayOrder',
      );
      return result.recordset.map(toAgeRatingDto);
    });
  },
};

const clips = {
  async create(clip) {
    return withRetry(async () => {
      const inserted = await (await request())
        .input('OwnerAccountId', sql.Int, clip.ownerAccountId)
        .input('ClipTitle', sql.NVarChar(160), clip.title)
        .input('Synopsis', sql.NVarChar(1000), nullable(clip.synopsis))
        .input('Publisher', sql.NVarChar(120), clip.publisher)
        .input('Producer', sql.NVarChar(120), clip.producer)
        .input('GenreCode', sql.NVarChar(24), clip.genreCode)
        .input('AgeRatingCode', sql.NVarChar(8), clip.ageRatingCode)
        .input('BlobName', sql.NVarChar(260), clip.blobName)
        .input('ContentType', sql.NVarChar(100), clip.contentType)
        .input('SizeBytes', sql.BigInt, clip.sizeBytes)
        .input('DurationSeconds', sql.Int, nullable(clip.durationSeconds))
        .input('PosterSeed', sql.Int, clip.posterSeed ?? 0)
        .query(
          `INSERT INTO rx.Clip
             (OwnerAccountId, ClipTitle, Synopsis, Publisher, Producer, GenreCode,
              AgeRatingCode, BlobName, ContentType, SizeBytes, DurationSeconds, PosterSeed)
           OUTPUT INSERTED.ClipId
           VALUES
             (@OwnerAccountId, @ClipTitle, @Synopsis, @Publisher, @Producer, @GenreCode,
              @AgeRatingCode, @BlobName, @ContentType, @SizeBytes, @DurationSeconds, @PosterSeed)`,
        );

      return clips.getById(Number(inserted.recordset[0].ClipId));
    });
  },

  async getById(clipId) {
    return withRetry(async () => {
      const result = await (await request())
        .input('ClipId', sql.Int, clipId)
        .query('SELECT * FROM rx.vwClipSummary WHERE ClipId = @ClipId');
      return toClipDto(result.recordset[0]);
    });
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
    return withRetry(async () => {
      const result = await (await request())
        .input('SearchTerm', sql.NVarChar(160), nullable(term))
        .input('GenreCode', sql.NVarChar(24), nullable(genreCode))
        .input('AgeRatingCode', sql.NVarChar(8), nullable(ageRatingCode))
        .input('MaxMinimumAge', sql.Int, nullable(maxMinimumAge))
        .input('SortBy', sql.NVarChar(16), sortBy)
        .input('PageNumber', sql.Int, page)
        .input('PageSize', sql.Int, pageSize)
        .execute('rx.uspSearchClips');

      const rows = result.recordset ?? [];
      return {
        items: rows.map(toClipDto),
        total: rows.length ? Number(rows[0].TotalMatches) : 0,
        page,
        pageSize,
      };
    });
  },

  async dashboard({ maxMinimumAge = null, latestCount = 12, trendingCount = 6 } = {}) {
    return withRetry(async () => {
      const result = await (await request())
        .input('MaxMinimumAge', sql.Int, nullable(maxMinimumAge))
        .input('LatestCount', sql.Int, latestCount)
        .input('TrendingCount', sql.Int, trendingCount)
        .execute('rx.uspDashboard');

      const [latest = [], trending = []] = result.recordsets ?? [];
      return {
        latest: latest.map(toClipDto),
        trending: trending.map(toClipDto),
      };
    });
  },

  async listByOwner(ownerAccountId) {
    return withRetry(async () => {
      const result = await (await request())
        .input('OwnerAccountId', sql.Int, ownerAccountId)
        .query(
          `SELECT * FROM rx.vwClipSummary
           WHERE OwnerAccountId = @OwnerAccountId
           ORDER BY PublishedUtc DESC, ClipId DESC`,
        );
      return result.recordset.map(toClipDto);
    });
  },

  async registerView(clipId, accountId = null) {
    return withRetry(async () => {
      const result = await (await request())
        .input('ClipId', sql.Int, clipId)
        .input('AccountId', sql.Int, nullable(accountId))
        .execute('rx.uspRegisterView');
      return Number(result.recordset?.[0]?.ViewCount ?? 0);
    });
  },

  async setPublishState(clipId, ownerAccountId, publishState) {
    return withRetry(async () => {
      const result = await (await request())
        .input('ClipId', sql.Int, clipId)
        .input('OwnerAccountId', sql.Int, ownerAccountId)
        .input('PublishState', sql.NVarChar(16), publishState)
        .query(
          `UPDATE rx.Clip SET PublishState = @PublishState
           OUTPUT INSERTED.ClipId
           WHERE ClipId = @ClipId AND OwnerAccountId = @OwnerAccountId`,
        );
      return result.recordset.length > 0;
    });
  },
};

const comments = {
  async listByClip(clipId, { page = 1, pageSize = 20 } = {}) {
    return withRetry(async () => {
      const result = await (await request())
        .input('ClipId', sql.Int, clipId)
        .input('Offset', sql.Int, (page - 1) * pageSize)
        .input('PageSize', sql.Int, pageSize)
        .query(
          `SELECT c.CommentId, c.ClipId, c.AccountId, c.CommentBody, c.ModerationVerdict,
                  c.ModerationSeverity, c.ModerationCategory, c.IsVisible, c.PostedUtc,
                  a.DisplayName AS AuthorDisplayName,
                  COUNT(*) OVER () AS TotalMatches
           FROM rx.ClipComment AS c
           INNER JOIN rx.Account AS a ON a.AccountId = c.AccountId
           WHERE c.ClipId = @ClipId AND c.IsVisible = 1
           ORDER BY c.PostedUtc DESC, c.CommentId DESC
           OFFSET @Offset ROWS FETCH NEXT @PageSize ROWS ONLY`,
        );

      const rows = result.recordset ?? [];
      return {
        items: rows.map(toCommentDto),
        total: rows.length ? Number(rows[0].TotalMatches) : 0,
        page,
        pageSize,
      };
    });
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
    return withRetry(async () => {
      const result = await (await request())
        .input('ClipId', sql.Int, clipId)
        .input('AccountId', sql.Int, accountId)
        .input('CommentBody', sql.NVarChar(1000), body)
        .input('ModerationVerdict', sql.NVarChar(16), moderationVerdict)
        .input('ModerationSeverity', sql.Int, moderationSeverity)
        .input('ModerationCategory', sql.NVarChar(32), nullable(moderationCategory))
        .input('IsVisible', sql.Bit, isVisible ? 1 : 0)
        .query(
          `INSERT INTO rx.ClipComment
             (ClipId, AccountId, CommentBody, ModerationVerdict, ModerationSeverity, ModerationCategory, IsVisible)
           OUTPUT INSERTED.CommentId, INSERTED.ClipId, INSERTED.AccountId, INSERTED.CommentBody,
                  INSERTED.ModerationVerdict, INSERTED.ModerationSeverity, INSERTED.ModerationCategory,
                  INSERTED.IsVisible, INSERTED.PostedUtc
           VALUES
             (@ClipId, @AccountId, @CommentBody, @ModerationVerdict, @ModerationSeverity, @ModerationCategory, @IsVisible)`,
        );

      const row = result.recordset[0];
      const author = await accounts.findById(Number(row.AccountId));
      return toCommentDto({ ...row, AuthorDisplayName: author?.displayName });
    });
  },
};

const ratings = {
  async upsert(clipId, accountId, score) {
    return withRetry(async () => {
      const result = await (await request())
        .input('ClipId', sql.Int, clipId)
        .input('AccountId', sql.Int, accountId)
        .input('RatingScore', sql.TinyInt, score)
        .execute('rx.uspUpsertRating');

      const row = result.recordset?.[0] ?? {};
      return {
        ratingCount: Number(row.RatingCount ?? 0),
        averageRating: Number(row.AverageRating ?? 0),
        yourScore: score,
      };
    });
  },

  async findForAccount(clipId, accountId) {
    return withRetry(async () => {
      const result = await (await request())
        .input('ClipId', sql.Int, clipId)
        .input('AccountId', sql.Int, accountId)
        .query(
          'SELECT RatingScore FROM rx.ClipRating WHERE ClipId = @ClipId AND AccountId = @AccountId',
        );
      const row = result.recordset[0];
      return row ? Number(row.RatingScore) : null;
    });
  },
};

const diagnostics = {
  async ping() {
    const started = Date.now();
    await withRetry(async () => (await request()).query('SELECT 1 AS Ok'), 2);
    return { provider: 'azure-sql', latencyMs: Date.now() - started };
  },
};

export const sqlRepository = {
  name: 'azure-sql',
  accounts,
  lookups,
  clips,
  comments,
  ratings,
  diagnostics,
};
