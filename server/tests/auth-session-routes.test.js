'use strict';

/**
 * auth-session-routes.test.js — the cookie contract of /api/auth/* (TODO.md #68).
 *
 * The point of #68 is that the credential stops being reachable from
 * JavaScript. Three things have to hold for that to be true, and each has its
 * own failure mode that no other test would notice:
 *
 *   - HttpOnly is actually set (otherwise nothing changed at all);
 *   - Secure tracks the request's protocol (hardcoded true silently drops the
 *     cookie on http dev; hardcoded false ships it in clear text in prod);
 *   - the session id never appears in a response body (which would hand it
 *     straight back to the JavaScript it was just taken away from).
 */

// This suite makes well over the router's 20-requests-per-15-minutes budget,
// so the limiter is stubbed out. The limit itself is not what is under test
// here (it predates #68 and is unchanged); leaving it in would just turn the
// later cases into 429s.
jest.mock('express-rate-limit', () => () => (req, res, next) => next());

jest.mock('bcrypt', () => ({
  compare: jest.fn(async () => true),
  hash: jest.fn(async () => '$2b$12$hashed'),
}));

jest.mock('../db/database', () => ({
  getUserByUsername: jest.fn(),
  getUserById: jest.fn(),
  createUser: jest.fn(),
  updateLastLogin: jest.fn(),
  createSession: jest.fn(),
  getSessionById: jest.fn(),
  revokeSession: jest.fn(() => ({ changes: 1 })),
  revokeSessionsForUser: jest.fn(() => ({ changes: 0 })),
  touchSession: jest.fn(),
  deleteExpiredSessions: jest.fn(() => ({ changes: 0 })),
}));

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const express = require('express');
const http    = require('http');
const jwt     = require('jsonwebtoken');

const db     = require('../db/database');
const config = require('../config');
const authRouter = require('../routes/auth');

let server, baseUrl;
let usernameCounter = 0;

// `trust proxy` mirrors server/index.js so X-Forwarded-Proto is honoured —
// this is what lets the Secure-flag tests simulate being behind the tunnel.
beforeAll(async () => {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  app.use('/api/auth', authRouter);

  server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise(r => server.close(r));
});

beforeEach(() => {
  jest.clearAllMocks();
  db.getUserByUsername.mockReturnValue(undefined);
});

const post = (path, { body, headers } = {}) => fetch(`${baseUrl}${path}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(headers || {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

function register(extra, headers) {
  usernameCounter += 1;
  return post('/api/auth/register', {
    body: { username: `user${usernameCounter}`, password: 'secret123', displayName: 'Alice', ...extra },
    headers,
  });
}

const guest = (headers) => post('/api/auth/guest', { headers });

function login(headers) {
  db.getUserByUsername.mockReturnValue({
    id: 'user-1', username: 'alice', password_hash: '$2b$12$x', display_name: 'Alice',
  });
  return post('/api/auth/login', { body: { username: 'alice', password: 'secret123' }, headers });
}

/** Parse a Set-Cookie header into { value, attrs } with lowercased attr names. */
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

const sessionCookieOf = (res) => {
  const header = res.headers.get('set-cookie');
  return header ? parseSetCookie(header) : null;
};

describe('session cookie attributes', () => {
  test.each([
    ['register', () => register()],
    ['login', () => login()],
    ['guest', () => guest()],
  ])('%s sets an HttpOnly, SameSite=Lax, Path=/ cookie', async (_label, call) => {
    const cookie = sessionCookieOf(await call());

    expect(cookie).not.toBeNull();
    expect(cookie.name).toBe(config.SESSION_COOKIE_NAME);
    expect(cookie.value.length).toBeGreaterThan(20);
    expect(cookie.attrs.httponly).toBe(true);
    expect(String(cookie.attrs.samesite).toLowerCase()).toBe('lax');
    expect(cookie.attrs.path).toBe('/');
  });

  test('Max-Age matches the 7-day user session TTL', async () => {
    const cookie = sessionCookieOf(await login());
    expect(Number(cookie.attrs['max-age'])).toBe(config.SESSION_TTL_MS / 1000);
  });

  test('Max-Age matches the 24-hour guest TTL — guests are not given a week', async () => {
    const cookie = sessionCookieOf(await guest());
    expect(Number(cookie.attrs['max-age'])).toBe(config.SESSION_GUEST_TTL_MS / 1000);
  });

  test('Secure is NOT set over plain http — otherwise the cookie is dropped in dev', async () => {
    const cookie = sessionCookieOf(await login());
    expect(cookie.attrs.secure).toBeUndefined();
  });

  test('Secure IS set behind an https-terminating proxy — the production shape', async () => {
    const cookie = sessionCookieOf(await login({ 'x-forwarded-proto': 'https' }));
    expect(cookie.attrs.secure).toBe(true);
  });
});

describe('the credential never reaches the response body', () => {
  test.each([
    ['register', () => register()],
    ['login', () => login()],
    ['guest', () => guest()],
  ])('%s returns no token and no session id in the body', async (_label, call) => {
    const res = await call();
    const cookie = sessionCookieOf(res);
    const text = await res.text();

    expect(text).not.toContain(cookie.value);
    expect(JSON.parse(text).token).toBeUndefined();
  });

  test('the body still carries the non-secret profile the UI needs', async () => {
    const body = await (await login()).json();

    expect(body.user).toEqual({
      userId: 'user-1',
      displayName: 'Alice',
      isGuest: false,
      expiresAt: expect.any(String),
    });
  });

  test('a guest body reports isGuest so the UI can badge it', async () => {
    const body = await (await guest()).json();

    expect(body.user.isGuest).toBe(true);
    expect(body.user.userId).toMatch(/^guest_/);
  });
});

describe('POST /api/auth/logout', () => {
  test('revokes the session server-side, not just the cookie', async () => {
    const res = await post('/api/auth/logout', { headers: { cookie: 'gvn_session=sess-1' } });

    expect(res.status).toBe(204);
    expect(db.revokeSession).toHaveBeenCalledWith('sess-1', expect.any(String));
  });

  test('clears the cookie with the SAME Path/SameSite it was set with', async () => {
    // A clear whose attributes disagree with the set silently deletes nothing.
    const res = await post('/api/auth/logout', { headers: { cookie: 'gvn_session=sess-1' } });
    const cookie = sessionCookieOf(res);

    expect(cookie.name).toBe(config.SESSION_COOKIE_NAME);
    expect(cookie.value).toBe('');
    expect(cookie.attrs.path).toBe('/');
    expect(String(cookie.attrs.samesite).toLowerCase()).toBe('lax');
  });

  test('succeeds with no cookie at all, and reveals nothing about session ids', async () => {
    const res = await post('/api/auth/logout');

    expect(res.status).toBe(204);
    expect(db.revokeSession).not.toHaveBeenCalled();
  });

  test('sets Cache-Control: no-store like the rest of /api/auth', async () => {
    const res = await post('/api/auth/logout');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('POST /api/auth/upgrade-session — legacy token migration', () => {
  const legacyToken = (over = {}, opts = { expiresIn: '7d' }) => jwt.sign(
    { userId: 'user-1', username: 'alice', displayName: 'Alice', isGuest: false, ...over },
    config.JWT_SECRET, opts
  );

  test('exchanges a valid legacy token for a session cookie', async () => {
    const res = await post('/api/auth/upgrade-session', { body: { token: legacyToken() } });
    const cookie = sessionCookieOf(res);

    expect(res.status).toBe(200);
    expect(cookie.attrs.httponly).toBe(true);
    expect(db.createSession).toHaveBeenCalledTimes(1);
  });

  test('preserves the token\'s REMAINING lifetime instead of granting a fresh one', async () => {
    // A migration should move a session, not silently extend everybody's by a
    // week. Token has ~1 hour left; the cookie must too.
    const res = await post('/api/auth/upgrade-session', {
      body: { token: legacyToken({}, { expiresIn: '1h' }) },
    });
    const maxAge = Number(sessionCookieOf(res).attrs['max-age']);

    expect(maxAge).toBeLessThanOrEqual(3600);
    expect(maxAge).toBeGreaterThan(3500);
    expect(maxAge).toBeLessThan(config.SESSION_TTL_MS / 1000);
  });

  test('carries a guest identity across, so guests are not stranded', async () => {
    const token = legacyToken({ userId: 'guest_abc12345', displayName: 'WildFox', isGuest: true }, { expiresIn: '24h' });

    const body = await (await post('/api/auth/upgrade-session', { body: { token } })).json();

    expect(body.user).toMatchObject({ userId: 'guest_abc12345', isGuest: true });
  });

  test.each([
    ['an expired token', () => legacyToken({}, { expiresIn: '-1s' })],
    ['a token signed with the wrong secret', () => jwt.sign({ userId: 'x' }, 'wrong-secret')],
    ['a garbage string', () => 'not.a.jwt'],
  ])('%s → 401 and no session created', async (_label, make) => {
    const res = await post('/api/auth/upgrade-session', { body: { token: make() } });

    expect(res.status).toBe(401);
    expect(db.createSession).not.toHaveBeenCalled();
  });

  test.each([
    ['a missing token', {}],
    ['a non-string token', { token: 12345 }],
    ['an explicitly null token', { token: null }],
  ])('%s → 400 and no session created', async (_label, body) => {
    const res = await post('/api/auth/upgrade-session', { body });

    expect(res.status).toBe(400);
    expect(db.createSession).not.toHaveBeenCalled();
  });
});
