'use strict';

/**
 * auth-google-oauth.test.js — GET /api/auth/google + /google/callback (TODO.md #91).
 *
 * Two describe blocks because GOOGLE_CLIENT_ID/SECRET are read once at
 * module load (config.js), so "not configured" vs "configured" each need
 * their own fresh require via jest.resetModules().
 */

jest.mock('express-rate-limit', () => () => (req, res, next) => next());
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('bcrypt', () => ({
  compare: jest.fn(async () => true),
  hash: jest.fn(async () => '$2b$12$hashed'),
}));

jest.mock('../db/database', () => ({
  getUserByUsername: jest.fn(),
  getUserById: jest.fn(),
  getUserByOAuthId: jest.fn(),
  createUser: jest.fn(),
  updateLastLogin: jest.fn(),
  createSession: jest.fn(),
  getSessionById: jest.fn(),
  hasLiveGuestSessionWithDisplayName: jest.fn(() => false),
  revokeSession: jest.fn(() => ({ changes: 1 })),
  revokeSessionsForUser: jest.fn(() => ({ changes: 0 })),
  touchSession: jest.fn(),
  deleteExpiredSessions: jest.fn(() => ({ changes: 0 })),
}));

// Names must start with "mock" — Jest's hoisting only allows the jest.mock()
// factory below (itself hoisted above these declarations) to close over
// out-of-scope variables with that prefix.
const mockGenerateAuthUrl = jest.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?mock=1');
const mockGetToken = jest.fn(async () => ({ tokens: { id_token: 'fake-id-token' } }));
const mockVerifyIdToken = jest.fn(async () => ({
  getPayload: () => ({
    sub: 'google-sub-1',
    email: 'alice@example.com',
    email_verified: true,
    name: 'Alice Nguyen',
  }),
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    generateAuthUrl: mockGenerateAuthUrl,
    getToken: mockGetToken,
    verifyIdToken: mockVerifyIdToken,
  })),
}));

const express = require('express');
const http    = require('http');

async function bootApp() {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  const authRouter = require('../routes/auth');
  app.use('/api/auth', authRouter);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

/** Parse a single Set-Cookie header into { name, value, attrs }. */
function parseSetCookie(header) {
  const [pair, ...rest] = header.split(';');
  const eq = pair.indexOf('=');
  const attrs = {};
  for (const part of rest) {
    const [k, v] = part.split('=');
    attrs[k.trim().toLowerCase()] = v === undefined ? true : v.trim();
  }
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attrs };
}

/**
 * fetch() refuses to let a test override the Host header (undici treats it
 * as connection-controlled, not request-controlled) — but that's exactly
 * what the "derives from Host" regression tests below need to simulate a
 * request arriving through a different origin (e.g. a Cloudflare Tunnel
 * domain) than the one Node is actually listening on. Raw http.request does
 * allow it.
 */
function rawGet(baseUrl, path, headers) {
  const url = new URL(baseUrl + path);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: url.hostname, port: url.port, path: url.pathname + url.search, headers }, (res) => {
      res.resume();
      res.on('end', () => resolve(res));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Google OAuth — not configured (no env vars)', () => {
  let server, baseUrl;

  beforeAll(async () => {
    jest.resetModules();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    ({ server, baseUrl } = await bootApp());
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  // TODO.md #98: both routes used to disagree on how they reported "not
  // configured" — /google returned raw JSON, /google/callback returned plain
  // text — dumping the browser outside login.html's styled error UI that
  // every OTHER OAuth failure uses. Both now redirect the same way.
  test('GET /api/auth/google → redirects to login.html?error=oauth_not_configured', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login.html?error=oauth_not_configured');
  });

  test('GET /api/auth/google/callback → redirects to login.html?error=oauth_not_configured, no session created', async () => {
    const db = require('../db/database');
    const res = await fetch(`${baseUrl}/api/auth/google/callback?code=abc&state=xyz`, { redirect: 'manual' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login.html?error=oauth_not_configured');
    expect(db.createSession).not.toHaveBeenCalled();
  });
});

describe('Google OAuth — configured', () => {
  let server, baseUrl, db;

  beforeAll(async () => {
    jest.resetModules();
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    db = require('../db/database');
    ({ server, baseUrl } = await bootApp());
  });

  afterAll(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.getUserByOAuthId.mockReturnValue(undefined);
    db.getUserByUsername.mockReturnValue(undefined);
    db.getUserById.mockImplementation((id) => ({
      id,
      username: 'alice_ab12cd',
      display_name: 'Alice Nguyen',
      oauth_provider: 'google',
      oauth_id: 'google-sub-1',
    }));
  });

  const callback = (query, headers) => fetch(
    `${baseUrl}/api/auth/google/callback${query}`,
    { headers, redirect: 'manual' }
  );

  // A valid-shaped state (matches OAUTH_STATE_RE — 32 lowercase hex chars,
  // same as crypto.randomBytes(16).toString('hex')) with its matching
  // per-flow cookie name (TODO.md #95), for tests that don't need a real
  // GET /google round trip.
  const RIGHT_STATE = 'a'.repeat(32);
  const rightStateCookie = () => `gvn_oauth_state_${RIGHT_STATE}=1`;

  test('redirects to the Google consent URL with a per-flow HttpOnly state cookie', async () => {
    const res = await fetch(`${baseUrl}/api/auth/google`, { redirect: 'manual' });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('accounts.google.com');
    expect(mockGenerateAuthUrl).toHaveBeenCalledWith(expect.objectContaining({
      scope: expect.arrayContaining(['openid', 'email', 'profile']),
      state: expect.any(String),
    }));

    const state = mockGenerateAuthUrl.mock.calls[0][0].state;
    const cookie = parseSetCookie(res.headers.get('set-cookie'));
    expect(cookie.name).toBe(`gvn_oauth_state_${state}`);
    expect(cookie.attrs.httponly).toBe(true);
    expect(cookie.attrs.path).toBe('/api/auth/google');
  });

  test('TODO.md #95: two concurrent /google requests (2 tabs) each get their own cookie, and both callbacks succeed', async () => {
    const res1 = await fetch(`${baseUrl}/api/auth/google`, { redirect: 'manual' });
    const state1 = mockGenerateAuthUrl.mock.calls[0][0].state;
    const cookie1 = parseSetCookie(res1.headers.get('set-cookie'));

    const res2 = await fetch(`${baseUrl}/api/auth/google`, { redirect: 'manual' });
    const state2 = mockGenerateAuthUrl.mock.calls[1][0].state;
    const cookie2 = parseSetCookie(res2.headers.get('set-cookie'));

    expect(cookie1.name).not.toBe(cookie2.name);

    // Flow 1's callback completes first, using only its own cookie.
    const cb1 = await callback(`?code=code1&state=${state1}`, { cookie: `${cookie1.name}=${cookie1.value}` });
    expect(cb1.headers.get('location')).toMatch(/^\/oauth-complete\.html#/);

    // Flow 2's callback, arriving after, still succeeds — its own cookie was
    // never touched by flow 1's request.
    db.getUserByOAuthId.mockReturnValueOnce(undefined);
    const cb2 = await callback(`?code=code2&state=${state2}`, { cookie: `${cookie2.name}=${cookie2.value}` });
    expect(cb2.headers.get('location')).toMatch(/^\/oauth-complete\.html#/);
  });

  test('callback with mismatched state → login.html?error=oauth_state, nothing touched', async () => {
    const res = await callback(`?code=abc&state=${'b'.repeat(32)}`, { cookie: rightStateCookie() });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login.html?error=oauth_state');
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(db.createSession).not.toHaveBeenCalled();
  });

  test('callback with no state cookie at all → login.html?error=oauth_state', async () => {
    const res = await callback(`?code=abc&state=${RIGHT_STATE}`);
    expect(res.headers.get('location')).toBe('/login.html?error=oauth_state');
  });

  test('TODO.md #96: no state cookie but no valid session either → still login.html?error=oauth_state (not silently treated as a duplicate)', async () => {
    db.getSessionById.mockReturnValue(undefined);
    const res = await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: 'gvn_session=some-id' });
    expect(res.headers.get('location')).toBe('/login.html?error=oauth_state');
  });

  test('TODO.md #96: duplicate callback (state cookie already consumed by a first request) with a valid session present → redirects to index.html, not an error', async () => {
    db.getSessionById.mockReturnValue({
      id: 'sess-1',
      user_id: 'existing-user-1',
      display_name: 'Alice Nguyen',
      is_guest: 0,
      revoked_at: null,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const res = await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: 'gvn_session=sess-1' });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/index.html');
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(db.createSession).not.toHaveBeenCalled();
  });

  test('callback with a malformed state query param → login.html?error=oauth_state (never used to build a cookie name)', async () => {
    const res = await callback('?code=abc&state=not-hex-at-all', { cookie: rightStateCookie() });
    expect(res.headers.get('location')).toBe('/login.html?error=oauth_state');
  });

  test('callback missing the code param → login.html?error=oauth_state', async () => {
    const res = await callback(`?state=${RIGHT_STATE}`, { cookie: rightStateCookie() });
    expect(res.headers.get('location')).toBe('/login.html?error=oauth_state');
  });

  test('new Google account: created, session started, redirects to oauth-complete.html#<user>', async () => {
    const res = await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: rightStateCookie() });

    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toMatch(/^\/oauth-complete\.html#/);

    expect(db.createUser).toHaveBeenCalledTimes(1);
    const created = db.createUser.mock.calls[0][0];
    expect(created.oauthProvider).toBe('google');
    expect(created.oauthId).toBe('google-sub-1');
    expect(created.username).toMatch(/^[a-zA-Z0-9_]{3,20}$/);
    expect(created.displayName).toBe('Alice Nguyen');

    expect(db.createSession).toHaveBeenCalledTimes(1);

    const user = JSON.parse(decodeURIComponent(location.split('#')[1]));
    expect(user.userId).toBe(created.id);
    expect(user.isGuest).toBe(false);
  });

  test('TODO.md #102: creating a new Google account does not re-read the row it just inserted', async () => {
    await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: rightStateCookie() });
    expect(db.getUserById).not.toHaveBeenCalled();
  });

  test('a Google profile with no usable display name falls back to a generated one', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: 'google-sub-3', email: 'x@example.com', email_verified: true, name: '' }),
    });

    await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: rightStateCookie() });

    const created = db.createUser.mock.calls[0][0];
    expect(created.displayName.length).toBeGreaterThanOrEqual(2);
  });

  // TODO.md #97: real Google names commonly contain a punctuation character
  // isValidDisplayName() forbids outright (apostrophes, "&"). These used to
  // silently discard the whole name and fall back to a random guest name;
  // the fix strips just the forbidden characters and keeps the rest.
  test.each([
    ["O'Brien", 'OBrien'],
    ['Marks & Co', 'Marks  Co'],
    ['"Quoted" Name', 'Quoted Name'],
  ])('TODO.md #97: Google name %j is sanitized to %j, not discarded', async (rawName, expected) => {
    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: 'google-sub-punct', email: 'p@example.com', email_verified: true, name: rawName }),
    });

    await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: rightStateCookie() });

    const created = db.createUser.mock.calls[0][0];
    expect(created.displayName).toBe(expected);
  });

  test('TODO.md #97: a Google name that is ONLY forbidden characters still falls back to a generated name', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: 'google-sub-onlypunct', email: 'q@example.com', email_verified: true, name: '<>&"\'' }),
    });

    await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: rightStateCookie() });

    const created = db.createUser.mock.calls[0][0];
    expect(created.displayName.length).toBeGreaterThanOrEqual(2);
    expect(created.displayName).not.toMatch(/[<>&"']/);
  });

  test('returning Google user (existing oauth_id): no new account, last_login updated', async () => {
    db.getUserByOAuthId.mockReturnValue({
      id: 'existing-user-1',
      username: 'alice_ab12cd',
      display_name: 'Alice Nguyen',
      oauth_provider: 'google',
      oauth_id: 'google-sub-1',
    });

    const res = await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: rightStateCookie() });

    expect(db.createUser).not.toHaveBeenCalled();
    expect(db.updateLastLogin).toHaveBeenCalledWith('existing-user-1', expect.any(String));
    const user = JSON.parse(decodeURIComponent(res.headers.get('location').split('#')[1]));
    expect(user.userId).toBe('existing-user-1');
  });

  test('unverified email is rejected, no account created', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ sub: 'google-sub-2', email: 'bob@example.com', email_verified: false }),
    });

    const res = await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: rightStateCookie() });

    expect(res.headers.get('location')).toBe('/login.html?error=oauth_failed');
    expect(db.createUser).not.toHaveBeenCalled();
  });

  test('a Google/network failure redirects to error, rather than throwing', async () => {
    mockGetToken.mockRejectedValueOnce(new Error('network down'));

    const res = await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: rightStateCookie() });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login.html?error=oauth_failed');
  });

  test('/google derives redirect_uri from the request Host, not a fixed value', async () => {
    // Regression test: a single fixed GOOGLE_CALLBACK_URL broke Google login
    // the moment the app was reached through a second origin (a Cloudflare
    // Tunnel domain) at the same time as localhost — the state cookie set on
    // one origin never reached Google's redirect back to the other. See
    // TODO.md #91's follow-up note.
    const res = await rawGet(baseUrl, '/api/auth/google', {
      Host: 'play3cr.dpdns.org',
      'X-Forwarded-Proto': 'https',
    });

    expect(res.statusCode).toBe(302);
    expect(mockGenerateAuthUrl).toHaveBeenCalledWith(expect.objectContaining({
      redirect_uri: 'https://play3cr.dpdns.org/api/auth/google/callback',
    }));
  });

  test('/google/callback derives redirect_uri from the request Host, not a fixed value', async () => {
    const res = await rawGet(baseUrl, `/api/auth/google/callback?code=abc&state=${RIGHT_STATE}`, {
      Host: 'play3cr.dpdns.org',
      'X-Forwarded-Proto': 'https',
      Cookie: rightStateCookie(),
    });

    expect(res.statusCode).toBe(302);
    expect(mockGetToken).toHaveBeenCalledWith(expect.objectContaining({
      redirect_uri: 'https://play3cr.dpdns.org/api/auth/google/callback',
    }));
  });

  test('TODO.md #94: losing the create race (SQLITE_CONSTRAINT_UNIQUE) retries via getUserByOAuthId instead of failing', async () => {
    let calls = 0;
    db.getUserByOAuthId.mockImplementation(() => {
      calls += 1;
      // 1st call: the initial "does this account exist yet?" check — no.
      // 2nd call: after losing the race, re-read the winner's row.
      if (calls === 1) return undefined;
      return {
        id: 'winner-id', username: 'alice_ab12cd', display_name: 'Alice Nguyen',
        oauth_provider: 'google', oauth_id: 'google-sub-1',
      };
    });
    const constraintErr = new Error('UNIQUE constraint failed: users.oauth_provider, users.oauth_id');
    constraintErr.code = 'SQLITE_CONSTRAINT_UNIQUE';
    db.createUser.mockImplementationOnce(() => { throw constraintErr; });

    const res = await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: rightStateCookie() });

    expect(res.status).toBe(302);
    const location = res.headers.get('location');
    expect(location).toMatch(/^\/oauth-complete\.html#/);
    const user = JSON.parse(decodeURIComponent(location.split('#')[1]));
    expect(user.userId).toBe('winner-id');
    expect(db.updateLastLogin).toHaveBeenCalledWith('winner-id', expect.any(String));
  });

  test('TODO.md #94: a constraint error with no winner row to re-read still falls through to oauth_failed', async () => {
    const constraintErr = new Error('UNIQUE constraint failed: users.oauth_provider, users.oauth_id');
    constraintErr.code = 'SQLITE_CONSTRAINT_UNIQUE';
    db.createUser.mockImplementationOnce(() => { throw constraintErr; });
    // getUserByOAuthId stays mocked to always return undefined (default from beforeEach).

    const res = await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: rightStateCookie() });

    expect(res.headers.get('location')).toBe('/login.html?error=oauth_failed');
  });

  test('TODO.md #94: a non-constraint createUser error still falls through to oauth_failed (not silently swallowed)', async () => {
    db.createUser.mockImplementationOnce(() => { throw new Error('disk I/O error'); });

    const res = await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: rightStateCookie() });

    expect(res.headers.get('location')).toBe('/login.html?error=oauth_failed');
  });

  test('generateOAuthUsername retries when its first candidate is already taken', async () => {
    let calls = 0;
    db.getUserByUsername.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? { id: 'someone-else' } : undefined;
    });

    await callback(`?code=abc&state=${RIGHT_STATE}`, { cookie: rightStateCookie() });

    expect(db.getUserByUsername).toHaveBeenCalledTimes(2);
  });
});
