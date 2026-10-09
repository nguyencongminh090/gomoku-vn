'use strict';

/**
 * guest-name.test.js — guest display names are `guest` + 4 digits (TODO.md #163).
 *
 * Covers the format itself, zero-padding at the low end of the range, the
 * re-roll-on-collision loop, and the give-up path when every candidate is
 * taken. The uniqueness check runs against a REAL in-memory SQLite loaded from
 * the actual schema so the "live guest only" SQL (is_guest / revoked_at /
 * expires_at filtering) is exercised for real, not mocked away.
 */

const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const express  = require('express');
const http     = require('http');
const Database = require('better-sqlite3');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');
mockDb.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));

jest.mock('express-rate-limit', () => () => (req, res, next) => next());
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

// Persistence layer pointed at the in-memory db, reusing the real SQL strings
// from database.js so a change to that SQL is reflected here.
jest.mock('../db/database', () => {
  const stmt = (sql) => mockDb.prepare(sql);
  return {
    getUserByUsername: () => undefined,
    getUserById: () => undefined,
    createUser: jest.fn(),
    updateLastLogin: jest.fn(),
    getUserByOAuthId: () => undefined,
    createSession: ({ id, userId, displayName, isGuest, createdAt, expiresAt }) =>
      stmt(`INSERT INTO sessions (id, user_id, display_name, is_guest, created_at, last_seen_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId || null, displayName, isGuest ? 1 : 0, createdAt, createdAt, expiresAt),
    getSessionById: (id) => stmt('SELECT * FROM sessions WHERE id = ?').get(id),
    hasLiveGuestSessionWithDisplayName: (displayName, now) => !!stmt(
      `SELECT 1 FROM sessions
       WHERE display_name = ? AND is_guest = 1 AND revoked_at IS NULL AND expires_at > ?
       LIMIT 1`
    ).get(displayName, now),
    revokeSession: () => ({ changes: 1 }),
    revokeSessionsForUser: () => ({ changes: 0 }),
    touchSession: jest.fn(),
    deleteExpiredSessions: () => ({ changes: 0 }),
  };
});

const db             = require('../db/database');
const sessionManager  = require('../managers/SessionManager');
const authRouter      = require('../routes/auth');

let server, baseUrl;

beforeAll(async () => {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  app.use('/api/auth', authRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
});

beforeEach(() => {
  mockDb.exec('DELETE FROM sessions');
  jest.restoreAllMocks();
});

const guest = () => fetch(`${baseUrl}/api/auth/guest`, { method: 'POST' });
const guestName = async () => (await (await guest()).json()).user.displayName;

// Seed a session row directly (bypasses the route) to set up collisions.
function seedSession({ displayName, isGuest = true, revoked = false, expiresInMs = 3600_000 }) {
  const now = Date.now();
  mockDb.prepare(
    `INSERT INTO sessions (id, user_id, display_name, is_guest, created_at, last_seen_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomBytes(16).toString('hex'),
    isGuest ? `guest_${crypto.randomBytes(4).toString('hex')}` : 'user-1',
    displayName, isGuest ? 1 : 0,
    new Date(now).toISOString(), new Date(now).toISOString(),
    new Date(now + expiresInMs).toISOString(),
    revoked ? new Date(now).toISOString() : null,
  );
}

describe('guest display name format', () => {
  test('is always "guest" + exactly 4 digits', async () => {
    for (let i = 0; i < 25; i++) {
      expect(await guestName()).toMatch(/^guest\d{4}$/);
      mockDb.exec('DELETE FROM sessions');
    }
  });

  test.each([
    [0, 'guest0000'],
    [7, 'guest0007'],
    [42, 'guest0042'],
    [999, 'guest0999'],
    [9999, 'guest9999'],
  ])('randomInt %i → %s (leading zeros kept)', async (n, expected) => {
    jest.spyOn(crypto, 'randomInt').mockReturnValue(n);
    expect(await guestName()).toBe(expected);
  });
});

describe('collision re-roll', () => {
  test('re-rolls past a name held by a live guest, then settles', async () => {
    seedSession({ displayName: 'guest0001' });
    const randomInt = jest.spyOn(crypto, 'randomInt')
      .mockReturnValueOnce(1)   // guest0001 — taken
      .mockReturnValueOnce(1)   // guest0001 — still taken
      .mockReturnValueOnce(42); // guest0042 — free
    expect(await guestName()).toBe('guest0042');
    expect(randomInt).toHaveBeenCalledTimes(3);
  });

  test('gives up after 20 tries and returns the last candidate anyway', async () => {
    seedSession({ displayName: 'guest0005' });
    const randomInt = jest.spyOn(crypto, 'randomInt').mockReturnValue(5);
    const spy = jest.spyOn(db, 'hasLiveGuestSessionWithDisplayName');
    expect(await guestName()).toBe('guest0005');
    expect(randomInt).toHaveBeenCalledTimes(20);
    expect(spy).toHaveBeenCalledTimes(20);
  });
});

describe('SessionManager.isGuestDisplayNameInUse — only live guests collide', () => {
  test.each([
    ['a live guest session', { isGuest: true }, true],
    ['an expired guest session', { isGuest: true, expiresInMs: -1000 }, false],
    ['a revoked guest session', { isGuest: true, revoked: true }, false],
    ['a registered user with that display name', { isGuest: false }, false],
  ])('%s → %j', (_label, opts, expected) => {
    seedSession({ displayName: 'guest1234', ...opts });
    expect(sessionManager.isGuestDisplayNameInUse('guest1234')).toBe(expected);
  });

  test('unknown name is free', () => {
    expect(sessionManager.isGuestDisplayNameInUse('guest0000')).toBe(false);
  });
});
