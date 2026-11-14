'use strict';

/**
 * avatar-lookup.test.js — roomManager.avatarLookup (perf/play-lag, 2026-11-14), real SQL on an
 * in-memory DB. Same URL as profile.js; the statement is prepared once, not per call (re-preparing
 * `SELECT *` per online user blocked the event loop 60–300 ms at ~1000 online).
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const database = require('../db/database');
const { avatarUrlFor } = require('../managers/avatar-lookup');

const NOW = '2026-11-14T00:00:00.000Z';
beforeAll(() => {
  const ins = database.db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`);
  ins.run('u1', 'u1', 'U1', NOW);
  ins.run('u2', 'u2', 'U2', NOW);
  database.db.prepare('UPDATE users SET avatar_v = 7 WHERE id = ?').run('u1');
});

test('URL carries the DB avatar_v; no avatar / unknown / empty id → null', () => {
  expect(avatarUrlFor('u1')).toBe('/api/profile/avatar/u1.webp?v=7');
  expect(avatarUrlFor('u2')).toBeNull();
  expect(avatarUrlFor('nobody')).toBeNull();
  expect(avatarUrlFor(null)).toBeNull();
});

test('reads the DB every call: a new avatar_v shows up at once (no stale cache)', () => {
  database.db.prepare('UPDATE users SET avatar_v = 8 WHERE id = ?').run('u1');
  expect(avatarUrlFor('u1')).toBe('/api/profile/avatar/u1.webp?v=8');
});

test('prepares its statement once, not per call', () => {
  const spy = jest.spyOn(database.db, 'prepare');
  for (let i = 0; i < 50; i++) avatarUrlFor('u1');
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});
