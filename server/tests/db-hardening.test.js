'use strict';

// B259: GOMOKU_DB_PATH override, trusted_schema OFF, json_valid CHECK + dropped idx_games_room_id (migration 005), literal LIKE on player filter.
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b259-'));
const dbFile = path.join(tmp, 'h.db');
let mod;

beforeAll(() => {
  process.env.GOMOKU_DB_PATH = dbFile;
  jest.isolateModules(() => { mod = require('../db/database'); });
});
afterAll(() => { mod.db.close(); delete process.env.GOMOKU_DB_PATH; });

const insert = (id, black, moves = '[]') => mod.db.prepare(`INSERT INTO games (id, room_id, black_player_name, white_player_name,
  board_size, started_at, moves) VALUES (?, 'r', ?, 'w', 15, 't', ?)`).run(id, black, moves);

test('GOMOKU_DB_PATH opens that file, not server/db/gomoku.db', () => {
  expect(fs.existsSync(dbFile)).toBe(true);
});

test('trusted_schema is OFF', () => {
  expect(mod.db.pragma('trusted_schema', { simple: true })).toBe(0);
});

test('fresh DB replays migration 005: no room_id index, other game indexes kept', () => {
  const idx = mod.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='games'").all().map((r) => r.name);
  expect(idx).not.toContain('idx_games_room_id');
  expect(idx).toEqual(expect.arrayContaining(['idx_games_ended_at', 'idx_games_black_player_id', 'idx_games_white_player_id']));
});

test('json_valid CHECK rejects bad moves/walls/portals, accepts NULL and JSON', () => {
  expect(() => insert('bad', 'b', '{oops')).toThrow(/CHECK/);
  expect(() => mod.db.prepare("UPDATE games SET walls = 'x' WHERE 1=0").run()).not.toThrow();
  insert('ok', 'b', '[{"x":1}]');
  insert('nul', 'b', null);
  expect(() => mod.db.prepare("INSERT INTO games (id, room_id, black_player_name, white_player_name, board_size, started_at, portals) VALUES ('p','r','b','w',15,'t','nope')").run()).toThrow(/CHECK/);
});

test('player_games FK to games survives the rebuild', () => {
  const fk = mod.db.prepare("PRAGMA foreign_key_list(player_games)").all().find((r) => r.from === 'game_id');
  expect(fk.table).toBe('games');
  expect(mod.db.pragma('foreign_key_check')).toEqual([]);
});

test('player filter treats % and _ literally', () => {
  insert('l1', '100%win'); insert('l2', 'a_b'); insert('l3', 'axb'); insert('l4', 'plain');
  const names = (p) => mod.getRecentGames(50, 0, { player: p }).map((g) => g.black_player_name).sort();
  expect(names('%')).toEqual(['100%win']);
  expect(names('a_b')).toEqual(['a_b']);
  expect(mod.getGameCount({ player: '_' })).toBe(1);
});
