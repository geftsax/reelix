process.env.DATA_PROVIDER = 'memory';
process.env.STORAGE_PROVIDER = 'local';
process.env.STORAGE_LOCAL_ROOT = '.localstore-test';
process.env.JWT_SECRET = 'test-secret-not-used-in-deployment';
process.env.BCRYPT_ROUNDS = '4';
process.env.CACHE_DASHBOARD_TTL = '30';
process.env.CACHE_SEARCH_TTL = '30';
process.env.RATE_LIMIT_MAX = '100000';
process.env.RATE_LIMIT_CREDENTIAL_MAX = '100000';

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { rm } from 'node:fs/promises';

const { createApp } = await import('../src/app.js');
const { resetMemoryStore, memoryRepository } = await import(
  '../src/repositories/memoryRepository.js'
);
const { clearCache } = await import('../src/services/cache.js');
const { resetMetrics } = await import('../src/services/metrics.js');

let server;
let baseUrl;

const call = async (path, { method = 'GET', token, body, headers = {}, raw } = {}) => {
  const requestHeaders = { ...headers };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  let payload = raw;
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: payload,
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return { status: response.status, headers: response.headers, body: json, text };
};

const multipart = (fields, file) => {
  const boundary = `----reelixtest${Math.floor(Math.random() * 1e9)}`;
  const chunks = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }

  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\n` +
        `Content-Type: ${file.contentType}\r\n\r\n`,
    ),
  );
  chunks.push(file.buffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
};

const FAKE_MP4 = Buffer.from('0000001c667479706d703432', 'hex');

const registerConsumer = async (overrides = {}) => {
  const payload = {
    emailAddress: `viewer${Math.floor(Math.random() * 1e9)}@example.com`,
    displayName: 'Test Viewer',
    password: 'Passw0rd123',
    birthYear: 1995,
    ...overrides,
  };
  const response = await call('/api/auth/register', { method: 'POST', body: payload });
  return { response, payload };
};

const makeCreator = async (email = `creator${Math.floor(Math.random() * 1e9)}@example.com`) => {
  const { createAccountWithRole, signToken } = await import('../src/services/authService.js');
  const account = await createAccountWithRole(
    {
      emailAddress: email,
      displayName: 'Test Creator',
      password: 'Passw0rd123',
      channelName: 'Test Channel',
      birthYear: 1990,
    },
    'creator',
  );
  return { account, token: signToken(account) };
};

const uploadClip = async (token, overrides = {}) => {
  const fields = {
    title: 'A Test Clip',
    publisher: 'Reelix Studios',
    producer: 'A Producer',
    genreCode: 'music',
    ageRatingCode: 'U',
    synopsis: 'A short synopsis.',
    durationSeconds: '25',
    ...overrides,
  };

  const form = multipart(fields, {
    field: 'video',
    filename: 'clip.mp4',
    contentType: 'video/mp4',
    buffer: FAKE_MP4,
  });

  return call('/api/clips', {
    method: 'POST',
    token,
    raw: form.body,
    headers: { 'Content-Type': form.contentType },
  });
};

before(async () => {
  const app = createApp();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm('.localstore-test', { recursive: true, force: true }).catch(() => {});
});

beforeEach(() => {
  resetMemoryStore();
  clearCache();
  resetMetrics();
});

describe('system routes', () => {
  it('reports healthy with the in-memory provider', async () => {
    const result = await call('/api/system/health');
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'healthy');
    assert.equal(result.body.dependencies.database.status, 'up');
  });

  it('exposes instrumentation counters', async () => {
    await call('/api/dashboard');
    const result = await call('/api/system/metrics');
    assert.equal(result.status, 200);
    assert.ok(result.body.requests.total >= 1);
    assert.ok('hitRatio' in result.body.cache);
  });

  it('returns 404 as JSON for an unknown route', async () => {
    const result = await call('/api/does-not-exist');
    assert.equal(result.status, 404);
    assert.equal(result.body.error, 'NotFound');
  });
});

describe('reference data', () => {
  it('publishes genres and age ratings for the upload form', async () => {
    const result = await call('/api/reference');
    assert.equal(result.status, 200);
    assert.ok(result.body.genres.length >= 5);
    assert.ok(result.body.ageRatings.some((rating) => rating.ageRatingCode === '18'));
  });
});

describe('consumer sign-up and sign-in', () => {
  it('creates a consumer account and returns a token', async () => {
    const { response } = await registerConsumer();
    assert.equal(response.status, 201);
    assert.equal(response.body.account.role, 'consumer');
    assert.ok(response.body.token);
    assert.equal(response.body.account.passwordHash, undefined);
  });

  it('rejects a weak password with field-level detail', async () => {
    const { response } = await registerConsumer({ password: 'short' });
    assert.equal(response.status, 422);
    assert.equal(response.body.error, 'ValidationFailed');
    assert.ok(response.body.details.password);
  });

  it('rejects a duplicate email address', async () => {
    const { payload } = await registerConsumer();
    const second = await call('/api/auth/register', { method: 'POST', body: payload });
    assert.equal(second.status, 409);
  });

  it('signs in with correct credentials and rejects wrong ones', async () => {
    const { payload } = await registerConsumer();

    const good = await call('/api/auth/login', {
      method: 'POST',
      body: { emailAddress: payload.emailAddress, password: payload.password },
    });
    assert.equal(good.status, 200);
    assert.ok(good.body.token);

    const bad = await call('/api/auth/login', {
      method: 'POST',
      body: { emailAddress: payload.emailAddress, password: 'WrongPass123' },
    });
    assert.equal(bad.status, 401);
  });

  it('returns the signed-in account from /me and 401 without a token', async () => {
    const { response } = await registerConsumer();

    const me = await call('/api/auth/me', { token: response.body.token });
    assert.equal(me.status, 200);
    assert.equal(me.body.account.role, 'consumer');

    const anonymous = await call('/api/auth/me');
    assert.equal(anonymous.status, 401);
  });
});

describe('role enforcement on upload', () => {
  it('lets a creator publish a clip with the required metadata', async () => {
    const creator = await makeCreator();
    const result = await uploadClip(creator.token);

    assert.equal(result.status, 201);
    assert.equal(result.body.clip.title, 'A Test Clip');
    assert.equal(result.body.clip.publisher, 'Reelix Studios');
    assert.equal(result.body.clip.producer, 'A Producer');
    assert.equal(result.body.clip.genreName, 'Music');
    assert.equal(result.body.clip.ageRatingCode, 'U');
    assert.equal(result.body.clip.owner.channelName, 'Test Channel');
  });

  it('refuses an upload from a consumer account', async () => {
    const { response } = await registerConsumer();
    const result = await uploadClip(response.body.token);

    assert.equal(result.status, 403);
    assert.match(result.body.message, /creator/);
  });

  it('refuses an anonymous upload', async () => {
    const form = multipart(
      { title: 'x', publisher: 'y', producer: 'z', genreCode: 'music', ageRatingCode: 'U' },
      { field: 'video', filename: 'c.mp4', contentType: 'video/mp4', buffer: FAKE_MP4 },
    );
    const result = await call('/api/clips', {
      method: 'POST',
      raw: form.body,
      headers: { 'Content-Type': form.contentType },
    });
    assert.equal(result.status, 401);
  });

  it('validates the metadata against the lookup tables', async () => {
    const creator = await makeCreator();
    const result = await uploadClip(creator.token, { genreCode: 'not-a-genre', title: 'ab' });

    assert.equal(result.status, 422);
    assert.ok(result.body.details.genreCode);
    assert.ok(result.body.details.title);
  });

  it('rejects a file type that is not a supported video', async () => {
    const creator = await makeCreator();
    const form = multipart(
      {
        title: 'Not a video',
        publisher: 'Reelix Studios',
        producer: 'A Producer',
        genreCode: 'music',
        ageRatingCode: 'U',
      },
      {
        field: 'video',
        filename: 'notes.txt',
        contentType: 'text/plain',
        buffer: Buffer.from('hello'),
      },
    );

    const result = await call('/api/clips', {
      method: 'POST',
      token: creator.token,
      raw: form.body,
      headers: { 'Content-Type': form.contentType },
    });

    assert.equal(result.status, 422);
  });
});

describe('catalogue, search and dashboard', () => {
  it('lists the newest clips on the dashboard', async () => {
    const creator = await makeCreator();
    await uploadClip(creator.token, { title: 'First Clip' });
    await uploadClip(creator.token, { title: 'Second Clip' });

    const result = await call('/api/dashboard');
    assert.equal(result.status, 200);
    assert.equal(result.body.latest.length, 2);
    assert.equal(result.body.latest[0].title, 'Second Clip');
  });

  it('searches across title, publisher and producer', async () => {
    const creator = await makeCreator();
    await uploadClip(creator.token, { title: 'Sunset Over Belfast', genreCode: 'travel' });
    await uploadClip(creator.token, { title: 'Guitar Practice', genreCode: 'music' });

    const byTitle = await call('/api/clips?q=belfast');
    assert.equal(byTitle.body.total, 1);
    assert.equal(byTitle.body.items[0].title, 'Sunset Over Belfast');

    const byGenre = await call('/api/clips?genre=music');
    assert.equal(byGenre.body.total, 1);
    assert.equal(byGenre.body.items[0].title, 'Guitar Practice');

    const noMatch = await call('/api/clips?q=zzzznothing');
    assert.equal(noMatch.body.total, 0);
  });

  it('pages the result set', async () => {
    const creator = await makeCreator();
    for (let index = 0; index < 5; index += 1) {
      await uploadClip(creator.token, { title: `Clip number ${index}` });
    }

    const page1 = await call('/api/clips?pageSize=2&page=1');
    const page2 = await call('/api/clips?pageSize=2&page=2');

    assert.equal(page1.body.total, 5);
    assert.equal(page1.body.items.length, 2);
    assert.equal(page2.body.items.length, 2);
    assert.notEqual(page1.body.items[0].clipId, page2.body.items[0].clipId);
  });

  it('returns a creator their own library', async () => {
    const creator = await makeCreator();
    await uploadClip(creator.token, { title: 'Mine One' });

    const library = await call('/api/clips/library', { token: creator.token });
    assert.equal(library.status, 200);
    assert.equal(library.body.total, 1);
  });
});

describe('age rating enforcement', () => {
  it('hides adult-rated clips from an anonymous visitor', async () => {
    const creator = await makeCreator();
    await uploadClip(creator.token, { title: 'Family Friendly', ageRatingCode: 'U' });
    await uploadClip(creator.token, { title: 'Adults Only', ageRatingCode: '18' });

    const anonymous = await call('/api/clips');
    assert.equal(anonymous.body.total, 1);
    assert.equal(anonymous.body.items[0].title, 'Family Friendly');
  });

  it('shows adult-rated clips to an adult consumer', async () => {
    const creator = await makeCreator();
    await uploadClip(creator.token, { title: 'Adults Only', ageRatingCode: '18' });

    const { response } = await registerConsumer({ birthYear: 1990 });
    const adult = await call('/api/clips', { token: response.body.token });
    assert.equal(adult.body.total, 1);
  });

  it('blocks playback of an over-age clip for a young consumer', async () => {
    const creator = await makeCreator();
    const upload = await uploadClip(creator.token, { ageRatingCode: '18' });
    const clipId = upload.body.clip.clipId;

    const young = await registerConsumer({ birthYear: new Date().getUTCFullYear() - 14 });
    const attempt = await call(`/api/clips/${clipId}/playback`, {
      token: young.response.body.token,
    });

    assert.equal(attempt.status, 403);
    assert.match(attempt.body.message, /rated 18/);
  });
});

describe('playback', () => {
  it('issues a playback url and increments the view count', async () => {
    const creator = await makeCreator();
    const upload = await uploadClip(creator.token);
    const clipId = upload.body.clip.clipId;

    const { response } = await registerConsumer();
    const first = await call(`/api/clips/${clipId}/playback`, { token: response.body.token });

    assert.equal(first.status, 200);
    assert.ok(first.body.playbackUrl);
    assert.ok(first.body.expiresOn);
    assert.equal(first.body.viewCount, 1);

    const second = await call(`/api/clips/${clipId}/playback`, { token: response.body.token });
    assert.equal(second.body.viewCount, 2);
  });

  it('requires a signed-in account to play', async () => {
    const creator = await makeCreator();
    const upload = await uploadClip(creator.token);
    const result = await call(`/api/clips/${upload.body.clip.clipId}/playback`);
    assert.equal(result.status, 401);
  });

  it('serves the stored file back through the local media route', async () => {
    const creator = await makeCreator();
    const upload = await uploadClip(creator.token);
    const { response } = await registerConsumer();

    const playback = await call(`/api/clips/${upload.body.clip.clipId}/playback`, {
      token: response.body.token,
    });

    const media = await fetch(`${baseUrl}${playback.body.playbackUrl}`);
    assert.equal(media.status, 200);
    const bytes = Buffer.from(await media.arrayBuffer());
    assert.equal(bytes.length, FAKE_MP4.length);
  });
});

describe('comments and moderation', () => {
  it('accepts a comment and lists it back', async () => {
    const creator = await makeCreator();
    const upload = await uploadClip(creator.token);
    const clipId = upload.body.clip.clipId;
    const { response } = await registerConsumer();

    const posted = await call(`/api/clips/${clipId}/comments`, {
      method: 'POST',
      token: response.body.token,
      body: { body: 'Really enjoyed this one.' },
    });

    assert.equal(posted.status, 201);
    assert.equal(posted.body.moderation.verdict, 'skipped');
    assert.equal(posted.body.comment.body, 'Really enjoyed this one.');

    const listed = await call(`/api/clips/${clipId}/comments`);
    assert.equal(listed.body.total, 1);
    assert.equal(listed.body.items[0].author.displayName, 'Test Viewer');
  });

  it('withholds a comment that breaches the guidelines', async () => {
    const creator = await makeCreator();
    const upload = await uploadClip(creator.token);
    const clipId = upload.body.clip.clipId;
    const { response } = await registerConsumer();

    const posted = await call(`/api/clips/${clipId}/comments`, {
      method: 'POST',
      token: response.body.token,
      body: { body: 'kill yourself' },
    });

    assert.equal(posted.status, 202);
    assert.equal(posted.body.moderation.verdict, 'blocked');
    assert.equal(posted.body.comment, null);

    const listed = await call(`/api/clips/${clipId}/comments`);
    assert.equal(listed.body.total, 0);
  });

  it('rejects an empty comment and an anonymous comment', async () => {
    const creator = await makeCreator();
    const upload = await uploadClip(creator.token);
    const clipId = upload.body.clip.clipId;
    const { response } = await registerConsumer();

    const empty = await call(`/api/clips/${clipId}/comments`, {
      method: 'POST',
      token: response.body.token,
      body: { body: ' ' },
    });
    assert.equal(empty.status, 422);

    const anonymous = await call(`/api/clips/${clipId}/comments`, {
      method: 'POST',
      body: { body: 'Nice clip' },
    });
    assert.equal(anonymous.status, 401);
  });
});

describe('ratings', () => {
  it('records a rating and replaces it on a second submission', async () => {
    const creator = await makeCreator();
    const upload = await uploadClip(creator.token);
    const clipId = upload.body.clip.clipId;
    const { response } = await registerConsumer();
    const token = response.body.token;

    const first = await call(`/api/clips/${clipId}/rating`, {
      method: 'PUT',
      token,
      body: { score: 5 },
    });
    assert.equal(first.status, 200);
    assert.equal(first.body.ratingCount, 1);
    assert.equal(first.body.averageRating, 5);

    const second = await call(`/api/clips/${clipId}/rating`, {
      method: 'PUT',
      token,
      body: { score: 3 },
    });
    assert.equal(second.body.ratingCount, 1, 'one account may hold only one rating');
    assert.equal(second.body.averageRating, 3);

    const mine = await call(`/api/clips/${clipId}/rating`, { token });
    assert.equal(mine.body.yourScore, 3);
  });

  it('averages ratings from different accounts', async () => {
    const creator = await makeCreator();
    const upload = await uploadClip(creator.token);
    const clipId = upload.body.clip.clipId;

    const a = await registerConsumer();
    const b = await registerConsumer();

    await call(`/api/clips/${clipId}/rating`, {
      method: 'PUT',
      token: a.response.body.token,
      body: { score: 5 },
    });
    const result = await call(`/api/clips/${clipId}/rating`, {
      method: 'PUT',
      token: b.response.body.token,
      body: { score: 2 },
    });

    assert.equal(result.body.ratingCount, 2);
    assert.equal(result.body.averageRating, 3.5);
  });

  it('rejects an out-of-range score', async () => {
    const creator = await makeCreator();
    const upload = await uploadClip(creator.token);
    const { response } = await registerConsumer();

    const result = await call(`/api/clips/${upload.body.clip.clipId}/rating`, {
      method: 'PUT',
      token: response.body.token,
      body: { score: 9 },
    });

    assert.equal(result.status, 422);
  });
});

describe('administration', () => {
  it('refuses admin routes to a consumer', async () => {
    const { response } = await registerConsumer();
    const result = await call('/api/admin/accounts', { token: response.body.token });
    assert.equal(result.status, 403);
  });

  it('lets an admin enrol a creator and promote an existing account', async () => {
    const { createAccountWithRole, signToken } = await import('../src/services/authService.js');
    const admin = await createAccountWithRole(
      {
        emailAddress: 'admin@reelix.test',
        displayName: 'Platform Admin',
        password: 'Passw0rd123',
        birthYear: 1985,
      },
      'admin',
    );
    const adminToken = signToken(admin);

    const created = await call('/api/admin/accounts', {
      method: 'POST',
      token: adminToken,
      body: {
        emailAddress: 'newcreator@reelix.test',
        displayName: 'New Creator',
        password: 'Passw0rd123',
        channelName: 'New Channel',
        role: 'creator',
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.account.role, 'creator');

    const consumer = await registerConsumer();
    const promoted = await call('/api/admin/accounts/role', {
      method: 'PATCH',
      token: adminToken,
      body: {
        emailAddress: consumer.payload.emailAddress,
        role: 'creator',
        channelName: 'Promoted Channel',
      },
    });
    assert.equal(promoted.status, 200);
    assert.equal(promoted.body.account.role, 'creator');
  });
});

describe('caching behaviour', () => {
  it('serves a conditional request as 304 and reports cache state', async () => {
    const creator = await makeCreator();
    await uploadClip(creator.token);

    const first = await call('/api/clips');
    assert.equal(first.status, 200);
    const etag = first.headers.get('etag');
    assert.ok(etag);

    const conditional = await call('/api/clips', { headers: { 'If-None-Match': etag } });
    assert.equal(conditional.status, 304);
  });

  it('invalidates the cached catalogue when a clip is published', async () => {
    const creator = await makeCreator();

    const before = await call('/api/clips');
    assert.equal(before.body.total, 0);

    await uploadClip(creator.token, { title: 'Freshly Published' });

    const after = await call('/api/clips');
    assert.equal(after.body.total, 1);
    assert.equal(after.body.items[0].title, 'Freshly Published');
  });
});

describe('repository contract', () => {
  it('exposes the same surface on the in-memory adapter as the sql adapter', async () => {
    const { sqlRepository } = await import('../src/repositories/sqlRepository.js');

    for (const group of ['accounts', 'lookups', 'clips', 'comments', 'ratings', 'diagnostics']) {
      const sqlMethods = Object.keys(sqlRepository[group]).sort();
      const memoryMethods = Object.keys(memoryRepository[group]).sort();
      assert.deepEqual(
        memoryMethods,
        sqlMethods,
        `adapter mismatch in '${group}': the two repositories must stay interchangeable`,
      );
    }
  });
});
