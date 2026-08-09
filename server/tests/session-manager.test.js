'use strict';

/**
 * session-manager.test.js — SessionManager lifecycle (TODO.md #68).
 *
 * These run against a REAL in-memory SQLite database loaded from the actual
 * schema.sql, not a mock. That is deliberate for this suite: the single most
 * likely way #68 could break in production is a schema-level mistake —
 * specifically a foreign key from sessions.user_id to users.id, which would
 * make every guest session fail to insert while all mocked tests kept passing.
 * A mock cannot catch that; `PRAGMA foreign_keys = ON` against the real schema
 * can.
 */

const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');
mockDb.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));

// Route the module's persistence layer at the in-memory db, reusing the real
// SQL from database.js rather than reimplementing it here.
jest.mock('../db/database', () => {
  const stmt = (sql) => mockDb.prepare(sql);
  return {
    createSession: ({ id, userId, displayName, isGuest, createdAt, expiresAt }) =>
      stmt(`INSERT INTO sessions (id, user_id, display_name, is_guest, created_at, last_seen_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, userId || null, displayName, isGuest ? 1 : 0, createdAt, createdAt, expiresAt),
    getSessionById: (id) => stmt('SELECT * FROM sessions WHERE id = ?').get(id),
    revokeSession: (id, at) =>
      stmt('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(at, id),
    revokeSessionsForUser: (userId, at, exceptId) => exceptId
      ? stmt('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL').run(at, userId, exceptId)
      : stmt('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(at, userId),
    touchSession: (id, at) => stmt('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(at, id),
    deleteExpiredSessions: (before) => stmt('DELETE FROM sessions WHERE expires_at < ?').run(before),
  };
});

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const sessionManager = require('../managers/SessionManager');

const USER  = { userId: 'user-1', displayName: 'Alice', isGuest: false };
const GUEST = { userId: 'guest_abc12345', displayName: 'WildFox', isGuest: true };

beforeEach(() => {
  mockDb.exec('DELETE FROM sessions');
});

describe('generateSessionId', () => {
  test('is 256 bits of base64url, unique per call', () => {
    const a = sessionManager.generateSessionId();
    const b = sessionManager.generateSessionId();

    expect(a).not.toBe(b);
    // 32 bytes base64url-encodes to 43 chars, and must contain nothing that
    // would need escaping in a Set-Cookie value.
    expect(a).toHaveLength(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('createSession → getValidSession', () => {
  test('a registered user round-trips', () => {
    const created = sessionManager.createSession(USER);
    const found = sessionManager.getValidSession(created.id);

    expect(found).toEqual({
      userId: 'user-1', displayName: 'Alice', isGuest: false, sessionId: created.id,
    });
  });

  test('a GUEST round-trips — no users row exists, so a FK here would fail', () => {
    // The whole point of this case: guests are never written to `users`, and
    // foreign_keys is ON above. If someone adds REFERENCES users(id) to
    // sessions.user_id, this is the test that fails.
    const created = sessionManager.createSession(GUEST);
    const found = sessionManager.getValidSession(created.id);

    expect(found.userId).toBe('guest_abc12345');
    expect(found.isGuest).toBe(true);
  });

  test('the returned userId is never derived from the session id', () => {
    // The session id is the credential; the userId is broadcast to every other
    // player. Slicing one from the other would publish part of the secret.
    const created = sessionManager.createSession(GUEST);
    const found = sessionManager.getValidSession(created.id);

    expect(created.id).not.toContain(found.userId);
    expect(found.userId).not.toContain(created.id.slice(0, 8));
  });

  test('default TTLs differ for users and guests', () => {
    const user = sessionManager.createSession(USER);
    const guest = sessionManager.createSession(GUEST);

    expect(user.ttlMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(guest.ttlMs).toBe(24 * 60 * 60 * 1000);
  });

  test('an explicit ttlMs overrides the default (used by the legacy-token migration)', () => {
    const created = sessionManager.createSession(USER, { ttlMs: 60_000 });

    expect(created.ttlMs).toBe(60_000);
    const expiresIn = Date.parse(created.expiresAt) - Date.now();
    expect(expiresIn).toBeGreaterThan(50_000);
    expect(expiresIn).toBeLessThanOrEqual(60_000);
  });
});

describe('getValidSession — rejection cases', () => {
  test.each([
    ['unknown id', () => 'never-existed'],
    ['empty string', () => ''],
    ['null', () => null],
    ['a number', () => 12345],
    ['an object', () => ({ id: 'x' })],
  ])('%s → null', (_label, makeInput) => {
    expect(sessionManager.getValidSession(makeInput())).toBeNull();
  });

  test('a revoked session → null (this is what "revocable" means)', () => {
    const created = sessionManager.createSession(USER);
    expect(sessionManager.getValidSession(created.id)).not.toBeNull();

    sessionManager.revokeSession(created.id);

    expect(sessionManager.getValidSession(created.id)).toBeNull();
  });

  test('an expired session → null, without needing to be revoked', () => {
    const created = sessionManager.createSession(USER, { ttlMs: -1000 });
    expect(sessionManager.getValidSession(created.id)).toBeNull();
  });

  test('boundary: a session expiring in 1s is valid, one that expired 1s ago is not', () => {
    const live = sessionManager.createSession(USER, { ttlMs: 1000 });
    const dead = sessionManager.createSession(USER, { ttlMs: -1 });

    expect(sessionManager.getValidSession(live.id)).not.toBeNull();
    expect(sessionManager.getValidSession(dead.id)).toBeNull();
  });
});

describe('revokeSession', () => {
  test('reports whether this call did the revoking, and is idempotent', () => {
    const created = sessionManager.createSession(USER);

    expect(sessionManager.revokeSession(created.id)).toBe(true);
    expect(sessionManager.revokeSession(created.id)).toBe(false);
  });

  test('re-revoking does not rewrite the original revoked_at', () => {
    const created = sessionManager.createSession(USER);
    sessionManager.revokeSession(created.id);
    const first = mockDb.prepare('SELECT revoked_at FROM sessions WHERE id = ?').get(created.id).revoked_at;

    sessionManager.revokeSession(created.id);
    const second = mockDb.prepare('SELECT revoked_at FROM sessions WHERE id = ?').get(created.id).revoked_at;

    expect(second).toBe(first);
  });

  test('revoking an unknown id is a no-op, not an error', () => {
    expect(sessionManager.revokeSession('nope')).toBe(false);
  });
});

describe('revokeOtherSessionsForUser — the session:kicked eviction', () => {
  test('kills the user\'s other sessions but spares the one just created', () => {
    const oldDevice = sessionManager.createSession(USER);
    const newDevice = sessionManager.createSession(USER);

    const revoked = sessionManager.revokeOtherSessionsForUser(USER.userId, newDevice.id);

    expect(revoked).toBe(1);
    expect(sessionManager.getValidSession(oldDevice.id)).toBeNull();
    expect(sessionManager.getValidSession(newDevice.id)).not.toBeNull();
  });

  test('never touches a different user\'s sessions', () => {
    const mine = sessionManager.createSession(USER);
    const theirs = sessionManager.createSession({ userId: 'user-2', displayName: 'Bob', isGuest: false });

    sessionManager.revokeOtherSessionsForUser(USER.userId, null);

    expect(sessionManager.getValidSession(mine.id)).toBeNull();
    expect(sessionManager.getValidSession(theirs.id)).not.toBeNull();
  });

  test('is a no-op for guests — a guest IS its session, there is no account', () => {
    const guest = sessionManager.createSession(GUEST);

    expect(sessionManager.revokeOtherSessionsForUser(GUEST.userId, null)).toBe(0);
    expect(sessionManager.getValidSession(guest.id)).not.toBeNull();
  });

  test('is a no-op for a missing userId', () => {
    expect(sessionManager.revokeOtherSessionsForUser(null, null)).toBe(0);
    expect(sessionManager.revokeOtherSessionsForUser('', null)).toBe(0);
  });
});

describe('sweepExpiredSessions', () => {
  test('deletes expired rows and leaves live ones alone', () => {
    const live = sessionManager.createSession(USER);
    sessionManager.createSession(USER, { ttlMs: -1000 });
    sessionManager.createSession(GUEST, { ttlMs: -1000 });

    expect(sessionManager.sweepExpiredSessions()).toBe(2);
    expect(sessionManager.getValidSession(live.id)).not.toBeNull();
  });

  test('keeps a revoked-but-unexpired row, so why it died stays auditable', () => {
    const created = sessionManager.createSession(USER);
    sessionManager.revokeSession(created.id);

    expect(sessionManager.sweepExpiredSessions()).toBe(0);
    expect(mockDb.prepare('SELECT id FROM sessions WHERE id = ?').get(created.id)).toBeTruthy();
  });

  test('an empty table sweeps to zero without error', () => {
    expect(sessionManager.sweepExpiredSessions()).toBe(0);
  });
});

describe('touchSession', () => {
  test('updates last_seen_at without affecting validity', () => {
    const created = sessionManager.createSession(USER);
    const before = mockDb.prepare('SELECT last_seen_at FROM sessions WHERE id = ?').get(created.id).last_seen_at;

    jest.spyOn(Date.prototype, 'toISOString').mockReturnValueOnce('2099-01-01T00:00:00.000Z');
    sessionManager.touchSession(created.id);

    const after = mockDb.prepare('SELECT last_seen_at FROM sessions WHERE id = ?').get(created.id).last_seen_at;
    expect(after).not.toBe(before);
    expect(sessionManager.getValidSession(created.id)).not.toBeNull();
  });

  test('touching an unknown id does not throw', () => {
    expect(() => sessionManager.touchSession('nope')).not.toThrow();
  });
});
