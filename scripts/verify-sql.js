import { config } from '../api/src/config.js';
import { repository } from '../api/src/repositories/index.js';
import { closePool, getPool, sql } from '../api/src/db/pool.js';

const results = [];
let failures = 0;

const check = async (label, fn) => {
  const startedAt = Date.now();
  try {
    const value = await fn();
    results.push({ label, status: 'ok', ms: Date.now() - startedAt });
    return value;
  } catch (error) {
    failures += 1;
    results.push({ label, status: 'FAILED', ms: Date.now() - startedAt, message: error.message });
    throw error;
  }
};

const suffix = process.pid.toString(36);
const probeEmail = `verify-creator-${suffix}@reelix.invalid`;
const viewerEmail = `verify-viewer-${suffix}@reelix.invalid`;

const cleanUp = async (clipId, accountIds) => {
  const pool = await getPool();

  if (clipId) {
    await pool.request().input('ClipId', sql.Int, clipId).query('DELETE FROM rx.Clip WHERE ClipId = @ClipId');
  }

  for (const accountId of accountIds.filter(Boolean)) {
    await pool
      .request()
      .input('AccountId', sql.Int, accountId)
      .query('DELETE FROM rx.Account WHERE AccountId = @AccountId');
  }
};

const main = async () => {
  if (config.dataProvider !== 'sql') {
    console.error("DATA_PROVIDER is not 'sql'. This script only verifies the Azure SQL adapter.");
    process.exit(1);
  }

  console.log(`Verifying the Azure SQL adapter against ${config.sql.server}/${config.sql.database}\n`);

  let creator = null;
  let viewer = null;
  let clip = null;

  try {
    await check('connection + SELECT 1', () => repository.diagnostics.ping());

    const genres = await check('rx.Genre lookup', () => repository.lookups.genres());
    const ratings = await check('rx.AgeRating lookup', () => repository.lookups.ageRatings());

    if (!genres.length || !ratings.length) {
      throw new Error('Reference data is missing. Run `npm run db:init` first.');
    }

    creator = await check('INSERT rx.Account (creator)', () =>
      repository.accounts.create({
        emailAddress: probeEmail,
        displayName: 'Verification Creator',
        passwordHash: '$2a$10$verificationhashverificationhashverificationhashve',
        role: 'creator',
        channelName: 'Verification Channel',
        birthYear: 1990,
      }),
    );

    viewer = await check('INSERT rx.Account (consumer)', () =>
      repository.accounts.create({
        emailAddress: viewerEmail,
        displayName: 'Verification Viewer',
        passwordHash: '$2a$10$verificationhashverificationhashverificationhashve',
        role: 'consumer',
        channelName: null,
        birthYear: 1995,
      }),
    );

    await check('SELECT rx.Account by email', () => repository.accounts.findByEmail(probeEmail));
    await check('SELECT rx.Account by id', () => repository.accounts.findById(creator.accountId));
    await check('UPDATE LastLoginUtc', () => repository.accounts.touchLogin(creator.accountId));
    await check('SELECT account list', () => repository.accounts.list());

    clip = await check('INSERT rx.Clip + read rx.vwClipSummary', () =>
      repository.clips.create({
        ownerAccountId: creator.accountId,
        title: `Verification clip ${suffix}`,
        synopsis: 'Created by scripts/verify-sql.js and removed again.',
        publisher: 'Verification Publisher',
        producer: 'Verification Producer',
        genreCode: genres[0].genreCode,
        ageRatingCode: 'U',
        blobName: `verify/${suffix}.mp4`,
        contentType: 'video/mp4',
        sizeBytes: 2048,
        durationSeconds: 12,
        posterSeed: 42,
      }),
    );

    await check('SELECT clip by id', () => repository.clips.getById(clip.clipId));

    const search = await check('EXEC rx.uspSearchClips (term)', () =>
      repository.clips.search({ term: `Verification clip ${suffix}`, page: 1, pageSize: 12 }),
    );
    if (search.total < 1) throw new Error('The search procedure did not return the new clip.');

    await check('EXEC rx.uspSearchClips (genre + age cap + sort)', () =>
      repository.clips.search({
        genreCode: genres[0].genreCode,
        maxMinimumAge: 18,
        sortBy: 'popular',
        page: 1,
        pageSize: 5,
      }),
    );

    const board = await check('EXEC rx.uspDashboard', () =>
      repository.clips.dashboard({ maxMinimumAge: 18, latestCount: 5, trendingCount: 3 }),
    );
    if (!Array.isArray(board.latest) || !Array.isArray(board.trending)) {
      throw new Error('The dashboard procedure did not return two result sets.');
    }

    await check('SELECT clips by owner', () => repository.clips.listByOwner(creator.accountId));

    const views = await check('EXEC rx.uspRegisterView', () =>
      repository.clips.registerView(clip.clipId, viewer.accountId),
    );
    if (views !== 1) throw new Error(`Expected a view count of 1, received ${views}.`);

    await check('INSERT rx.ClipComment', () =>
      repository.comments.create({
        clipId: clip.clipId,
        accountId: viewer.accountId,
        body: 'Verification comment.',
        moderationVerdict: 'allowed',
        moderationSeverity: 0,
        moderationCategory: null,
        isVisible: true,
      }),
    );

    const comments = await check('SELECT comments with paging', () =>
      repository.comments.listByClip(clip.clipId, { page: 1, pageSize: 10 }),
    );
    if (comments.total !== 1) throw new Error('The comment query did not return the new comment.');

    const rating = await check('EXEC rx.uspUpsertRating (insert)', () =>
      repository.ratings.upsert(clip.clipId, viewer.accountId, 5),
    );
    if (rating.ratingCount !== 1) throw new Error('The rating merge did not insert.');

    const reRating = await check('EXEC rx.uspUpsertRating (update)', () =>
      repository.ratings.upsert(clip.clipId, viewer.accountId, 3),
    );
    if (reRating.ratingCount !== 1 || Number(reRating.averageRating) !== 3) {
      throw new Error('Re-rating should replace the score, not add a second row.');
    }

    await check('SELECT own rating', () =>
      repository.ratings.findForAccount(clip.clipId, viewer.accountId),
    );

    await check('UPDATE publish state', () =>
      repository.clips.setPublishState(clip.clipId, creator.accountId, 'hidden'),
    );
  } catch {
  } finally {
    try {
      await cleanUp(clip?.clipId, [creator?.accountId, viewer?.accountId]);
      console.log('Verification rows removed.\n');
    } catch (error) {
      console.error(`Clean-up failed - remove ${probeEmail} manually: ${error.message}\n`);
    }
  }

  const width = Math.max(...results.map((entry) => entry.label.length)) + 2;
  results.forEach((entry) => {
    const line = `${entry.label.padEnd(width)} ${entry.status.padEnd(7)} ${String(entry.ms).padStart(5)} ms`;
    console.log(entry.message ? `${line}\n${' '.repeat(width)} ${entry.message}` : line);
  });

  console.log(`\n${results.length - failures}/${results.length} checks passed.`);

  await closePool().catch(() => {});
  process.exit(failures ? 1 : 0);
};

main().catch(async (error) => {
  console.error('Verification aborted:', error.message);
  await closePool().catch(() => {});
  process.exit(1);
});
