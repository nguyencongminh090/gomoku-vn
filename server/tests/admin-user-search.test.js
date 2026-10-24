'use strict';

/** AdminUserService.listUsers uses the shared NLP name search (feature/user-search). */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../utils/roles', () => ({ can: () => true, ROLES: ['member', 'moderator', 'admin'] }));

const database = require('../db/database');
const admin = require('../managers/AdminUserService');

const add = (id, username, display) => database.db.prepare(
  `INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, '2026-10-01T00:00:00.000Z')`
).run(id, username, display);

beforeAll(() => { add('a', 'vnduc', 'Nguyễn Văn Đức'); add('b', 'tbinh', 'Trần Thị Bình'); });

const names = (q) => admin.listUsers('admin', { q }).users.map((u) => u.username);

test('accent/case-insensitive, any order; total follows the matches', () => {
  expect(names('NGUYEN')).toEqual(['vnduc']);
  expect(names('duc van')).toEqual(['vnduc']);
  expect(admin.listUsers('admin', { q: 'binh' }).pagination.total).toBe(1);
});
test('no match, wildcards literal, empty query lists everyone', () => {
  expect(names('zzzz')).toEqual([]);
  expect(names('%')).toEqual([]);
  expect(names('')).toHaveLength(2);
});
