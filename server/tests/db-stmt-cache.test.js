'use strict';

/**
 * db-stmt-cache.test.js — B379: server/db helpers prepared SQL on every call (`prepare` was the top
 * self-time frame in the 2026-11-14 CPU profile). They now go through connection.stmt(), which keeps
 * one statement per SQL text. Real SQL on an in-memory DB.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const database = require('../db/database');
const { stmt, STMT_CACHE_MAX } = require('../db/connection');

const NOW = '2026-11-14T00:00:00.000Z';
beforeAll(() => {
  database.createUser({ id: 'u1', username: 'alice', passwordHash: 'x', displayName: 'Alice', createdAt: NOW });
});

test('stmt() returns the same statement for the same SQL text, a new one for another', () => {
  const a = stmt('SELECT 1 AS one');
  expect(stmt('SELECT 1 AS one')).toBe(a);
  expect(stmt('SELECT 2 AS two')).not.toBe(a);
  expect(a.get().one).toBe(1);
});

test('REST/auth helpers do not call db.prepare on repeat calls', () => {
  // Warm every statement once (first call prepares).
  const warm = () => {
    database.getUserById('u1');
    database.getUserByUsername('alice');
    database.getProfileById('u1');
    database.updateProfile('u1', { bio: 'hi' });
    database.getGameCount({});
    database.getRankingCount('standard');
  };
  warm();
  const spy = jest.spyOn(database.db, 'prepare');
  for (let i = 0; i < 20; i++) warm();
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});

test('cached statements still read current data (no result caching)', () => {
  expect(database.getUserById('u1').display_name).toBe('Alice');
  database.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run('Alice2', 'u1');
  expect(database.getUserById('u1').display_name).toBe('Alice2');
  database.updateProfile('u1', { bio: 'second' });
  expect(database.getProfileById('u1').bio).toBe('second');
});

test('option-built SQL caches one statement per distinct text and stays correct', () => {
  expect(database.updateProfile('u1', { bio: 'b', city: 'Hanoi' })).toBeUndefined();
  const p = database.getProfileById('u1');
  expect([p.bio, p.city]).toEqual(['b', 'Hanoi']);
});

test('past STMT_CACHE_MAX distinct texts, statements still work (prepared, not kept)', () => {
  for (let i = 0; i < STMT_CACHE_MAX + 5; i++) expect(stmt(`SELECT ${i} AS n`).get().n).toBe(i);
  const spy = jest.spyOn(database.db, 'prepare');
  stmt(`SELECT ${STMT_CACHE_MAX + 4} AS n`);
  expect(spy).toHaveBeenCalledTimes(1); // over the cap → not cached
  spy.mockRestore();
});
