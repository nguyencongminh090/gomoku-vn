'use strict';

/**
 * db-read-perf-384.test.js — B384: the games list / stats filters must be answered from
 * idx_games_ended_at (migration 015), never by scanning the wide `games` rows; page cache pragma.
 */

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { db } = require('../db/connection');
const games = require('../db/games');

const plan = (sql, ...p) => db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...p).map((r) => r.detail).join(' | ');
const LIKE = "(black_player_name LIKE ? ESCAPE '\\' OR white_player_name LIKE ? ESCAPE '\\')";

beforeAll(() => {
  const ins = db.prepare(`INSERT INTO games (id, room_id, black_player_name, white_player_name, winner_color, board_size, started_at, ended_at)
                          VALUES (?, ?, ?, ?, ?, 15, ?, ?)`);
  const day = (i) => `2026-11-${String(1 + (i % 9)).padStart(2, '0')}T10:00:${String(i % 60).padStart(2, '0')}.000Z`;
  db.transaction(() => {
    for (let i = 0; i < 300; i++) ins.run(`g${i}`, `r${i}`, i % 7 === 0 ? 'Minh' : `P${i}`, `Q${i}`, i % 10 === 0 ? 'DRAW' : (i % 2 ? 'BLACK' : 'WHITE'), day(i), day(i));
    ins.run('open', 'ro', 'Minh', 'Z', null, day(1), null); // interrupted game: no ended_at
  })();
  db.exec('ANALYZE');
});

test('migration 015: idx_games_ended_at covers the filter columns, ended_at first', () => {
  expect(db.pragma('index_info(idx_games_ended_at)').map((c) => c.name)).toEqual(['ended_at', 'winner_color', 'black_player_name', 'white_player_name']);
});

test.each([
  ['stats by result', "SELECT SUM(CASE WHEN winner_color = 'DRAW' THEN 1 ELSE 0 END), COUNT(*) FROM games WHERE ended_at IS NOT NULL", []],
  ['stats by date', 'SELECT substr(ended_at, 1, 10) AS date, COUNT(*) FROM games WHERE ended_at IS NOT NULL GROUP BY date', []],
  ['name COUNT', `SELECT COUNT(*) FROM games WHERE ${LIKE}`, ['%mi%', '%mi%']],
  ['name + result COUNT', `SELECT COUNT(*) FROM games WHERE ${LIKE} AND winner_color = 'DRAW'`, ['%mi%', '%mi%']],
  ['name + date range COUNT', `SELECT COUNT(*) FROM games WHERE ${LIKE} AND ended_at >= ? AND ended_at <= ?`, ['%mi%', '%mi%', '2026-11-02', '2026-11-05']],
])('%s runs on the covering index (no table scan)', (_label, sql, params) => {
  const p = plan(sql, ...params);
  expect(p).toMatch(/COVERING INDEX idx_games_ended_at/);
  expect(p).not.toMatch(/SCAN games(?! USING)/);
});

test('the list page still walks the index in ended_at order (no sort step)', () => {
  const p = plan(`SELECT id, moves FROM games WHERE ${LIKE} ORDER BY ended_at DESC LIMIT 20`, '%mi%', '%mi%');
  expect(p).toMatch(/USING INDEX idx_games_ended_at/);
  expect(p).not.toMatch(/TEMP B-TREE/);
});

test('results are unchanged: counts, stats, order and filters', () => {
  expect(games.getGameCount()).toBe(301);
  expect(games.getGameCount({ player: 'minh' })).toBe(44);                 // 43 finished (i % 7 === 0) + the open one
  expect(games.getGameCount({ player: 'minh', result: 'draw' })).toBe(5);   // i % 70 === 0
  expect(games.getGameStatsByResult()).toEqual({ draw: 30, win: 270, total: 300 });
  expect(games.getGameStatsByResult({ player: 'nobody-has-this-name' })).toEqual({ draw: 0, win: 0, total: 0 });
  expect(games.getGameStatsByDate().reduce((n, d) => n + d.count, 0)).toBe(300);
  const page = games.getRecentGames(20, 0, { player: 'minh', from: '2026-11-02T00:00:00.000Z', to: '2026-11-05T23:59:59.999Z' });
  expect(page.length).toBeGreaterThan(0);
  expect(page.every((g) => g.black_player_name === 'Minh' && g.ended_at >= '2026-11-02' && g.ended_at < '2026-11-06')).toBe(true);
  expect(page.map((g) => g.ended_at)).toEqual([...page.map((g) => g.ended_at)].sort().reverse());
  expect(games.getGameCount({ player: '100%' })).toBe(0);                   // LIKE wildcards stay escaped
});

test('page cache is 64 MB by default; mmap stays off', () => {
  expect(db.pragma('cache_size', { simple: true })).toBe(-65536);
  expect(db.pragma('mmap_size', { simple: true })).toBe(0);
});
