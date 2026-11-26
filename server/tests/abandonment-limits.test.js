'use strict';

/**
 * abandonment-limits.test.js — #495 (features/presence-status Q5 A / Q12 A): rated abandonments and aborts are
 * recorded per member (migration 027, real SQL on an in-memory DB); three in 24 h make a repeat leaver, whose
 * absence budget is halved (floor 15 s) and who may not quick-match for 10 minutes after the latest one.
 * Guests: per guest id in memory, never per IP. Pruned after 7 days.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const database = require('../db/database');
const A = require('../managers/AbandonmentService');

const T0 = Date.parse('2026-11-27T12:00:00Z');
const MIN = 60_000;
const HOUR = 60 * MIN;

beforeAll(() => {
  const ins = database.db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`);
  for (const id of ['m1', 'm2', 'm3']) ins.run(id, id, id, '2026-11-01T00:00:00.000Z');
});
beforeEach(() => { database.db.prepare('DELETE FROM abandonment_events').run(); A._guestEvents.clear(); });

test('the table exists with its kind CHECK (migration 027)', () => {
  expect(() => database.db.prepare('INSERT INTO abandonment_events (user_id, game_id, kind, at) VALUES (?, ?, ?, ?)').run('m1', 'g', 'resign', T0))
    .toThrow(/CHECK/);
  expect(A.record('m1', 'g1', 'bogus', T0)).toBe(false);
});

test('two events: not a repeat leaver; the third within 24 h makes one', () => {
  A.record('m1', 'g1', 'abandon', T0);
  A.record('m1', 'g2', 'abort', T0 + HOUR);
  expect(A.isRepeatLeaver('m1', T0 + 2 * HOUR)).toBe(false);
  expect(A.budgetFor('m1', 60_000, T0 + 2 * HOUR)).toBe(60_000);
  A.record('m1', 'g3', 'abandon', T0 + 2 * HOUR);
  expect(A.recent('m1', T0 + 2 * HOUR)).toEqual({ count: 3, lastAt: T0 + 2 * HOUR });
  expect(A.isRepeatLeaver('m1', T0 + 2 * HOUR)).toBe(true);
  expect(A.isRepeatLeaver('m2', T0 + 2 * HOUR)).toBe(false); // per member
});

test('budget halved for a repeat leaver, never below 15 s', () => {
  for (let i = 0; i < 3; i++) A.record('m1', 'g' + i, 'abandon', T0 + i);
  expect(A.budgetFor('m1', 60_000, T0 + 10)).toBe(30_000);
  expect(A.budgetFor('m1', 20_000, T0 + 10)).toBe(15_000);
  expect(A.budgetFor('m2', 20_000, T0 + 10)).toBe(20_000);
});

test('quick-match cooldown: 10 minutes after the latest event, only for a repeat leaver', () => {
  for (let i = 0; i < 3; i++) A.record('m1', 'g' + i, 'abandon', T0 + i * MIN);
  const last = T0 + 2 * MIN;
  expect(A.cooldownLeftMs('m1', last + MIN)).toBe(9 * MIN);
  expect(A.cooldownLeftMs('m1', last + 10 * MIN)).toBe(0);
  A.record('m2', 'x', 'abandon', T0);
  expect(A.cooldownLeftMs('m2', T0 + MIN)).toBe(0);
});

test('events older than 24 h stop counting; prune drops rows older than 7 days', () => {
  for (let i = 0; i < 3; i++) A.record('m1', 'g' + i, 'abandon', T0 + i);
  expect(A.isRepeatLeaver('m1', T0 + 25 * HOUR)).toBe(false);
  A.record('m2', 'old', 'abandon', T0 - 8 * 24 * HOUR);
  expect(A.prune(T0)).toBe(1);
  expect(database.db.prepare('SELECT COUNT(*) AS n FROM abandonment_events').get().n).toBe(3);
});

test('guests are tracked per guest id in memory, never in the table and never per IP', () => {
  for (let i = 0; i < 3; i++) A.record('guest_ab12', 'g' + i, 'abort', T0 + i);
  expect(A.isRepeatLeaver('guest_ab12', T0 + 10)).toBe(true);
  expect(A.isRepeatLeaver('guest_cd34', T0 + 10)).toBe(false); // another guest (same IP or not) is untouched
  expect(database.db.prepare('SELECT COUNT(*) AS n FROM abandonment_events').get().n).toBe(0);
  A.prune(T0 + 25 * HOUR);
  expect(A._guestEvents.has('guest_ab12')).toBe(false);
});

test('a DB failure never throws into the game path', () => {
  const spy = jest.spyOn(database.db, 'prepare').mockImplementation(() => { throw new Error('SQLITE_BUSY'); });
  expect(A.record('m3', 'g', 'abandon', T0)).toBe(false);
  expect(A.recent('m3', T0)).toEqual({ count: 0, lastAt: null });
  expect(A.prune(T0)).toBe(0);
  spy.mockRestore();
});
