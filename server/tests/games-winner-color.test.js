'use strict';

// B257: migration 004 adds games.winner_color (CHECK) and backfills it from the overloaded `winner`.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../db/migrate');
const { upgradeLegacy } = require('../db/legacy-upgrade');

jest.mock('../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const dbDir = path.join(__dirname, '../db');
const schemaSql = fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf8');
const migrate = (db, dir) => runMigrations(db, { dir, schemaSql, legacy: upgradeLegacy });

// Baseline (v3) DB with one game per legacy `winner` shape, then run the real migrations on it.
function legacyDb() {
  const only003 = fs.mkdtempSync(path.join(require('os').tmpdir(), 'wc-'));
  const db = new Database(':memory:');
  migrate(db, only003); // schema + legacy upgrade, stamped v3
  db.pragma('foreign_keys = OFF');
  const ins = db.prepare(`INSERT INTO games (id, room_id, black_player_id, white_player_id, black_player_name, white_player_name,
    winner, board_size, started_at) VALUES (?, 'r', ?, ?, 'b', 'w', ?, 15, 't')`);
  [
    ['black', 'u1', 'u2', 'BLACK'], ['white', 'u1', 'u2', 'WHITE'], ['draw', 'u1', 'u2', 'draw'],
    ['id-black', 'u1', 'u2', 'u1'], ['id-white', 'u1', 'u2', 'u2'],
    ['guest-seat', null, 'u2', 'BLACK'], ['orphan-id', null, null, 'guest_x'], ['interrupted', 'u1', 'u2', null],
  ].forEach((r) => ins.run(...r));
  return db;
}

test('migration 004 backfills winner_color for every legacy winner shape', () => {
  const db = legacyDb();
  migrate(db, path.join(dbDir, 'migrations'));
  const got = Object.fromEntries(db.prepare('SELECT id, winner_color c FROM games').all().map((r) => [r.id, r.c]));
  expect(got).toEqual({
    black: 'BLACK', white: 'WHITE', draw: 'DRAW', 'id-black': 'BLACK', 'id-white': 'WHITE',
    'guest-seat': 'BLACK', 'orphan-id': null, interrupted: null,
  });
  expect(db.prepare('SELECT COUNT(*) n FROM games WHERE winner IS NOT NULL').get().n).toBe(7); // winner kept
});

test('CHECK rejects a bad winner_color but allows NULL', () => {
  const db = legacyDb();
  migrate(db, path.join(dbDir, 'migrations'));
  expect(() => db.prepare("UPDATE games SET winner_color = 'draw' WHERE id = 'black'").run()).toThrow(/CHECK/);
  expect(() => db.prepare("UPDATE games SET winner_color = NULL WHERE id = 'black'").run()).not.toThrow();
});
