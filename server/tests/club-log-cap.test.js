'use strict';

/** club-log-cap.test.js — #256: club_log keeps the newest LOG_KEEP rows per club. */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const database = require('../db/database');
const { log, LOG_KEEP } = require('../managers/ClubService');

const db = database.db;
const NOW = '2026-10-16T00:00:00.000Z';

function addClub(slug) {
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`)
    .run(`${slug}-u`, `${slug}-u`, slug, NOW);
  db.prepare('INSERT INTO clubs (id, slug, name, owner_id, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(`${slug}-id`, slug, slug, `${slug}-u`, NOW);
  return `${slug}-id`;
}
const rows = (clubId) => db.prepare('SELECT detail FROM club_log WHERE club_id = ? ORDER BY id').all(clubId).map((r) => r.detail);

it('510 inserts keep the newest 500; other clubs untouched', () => {
  const a = addClub('cap-a');
  const b = addClub('cap-b');
  for (let i = 0; i < 3; i++) log(b, 'join', null, null, `b${i}`);
  for (let i = 0; i < 510; i++) log(a, 'join', null, null, `a${i}`);
  const kept = rows(a);
  expect(LOG_KEEP).toBe(500);
  expect(kept).toHaveLength(500);
  expect(kept[0]).toBe('a10');
  expect(kept[499]).toBe('a509');
  expect(rows(b)).toEqual(['b0', 'b1', 'b2']);
});
