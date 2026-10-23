'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations, BASELINE } = require('../db/migrate');
const { upgradeLegacy } = require('../db/legacy-upgrade');

jest.mock('../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const schemaSql = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
let dir;
const mig = (name, sql) => fs.writeFileSync(path.join(dir, name), sql);
const run = (db) => runMigrations(db, { dir, schemaSql, legacy: upgradeLegacy });
const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test('fresh DB: schema built and stamped at baseline', () => {
  const db = new Database(':memory:');
  run(db);
  expect(db.pragma('user_version', { simple: true })).toBe(BASELINE);
  expect(cols(db, 'users')).toContain('last_login_at');
});

test('fresh DB applies pending migrations 004+ in order and ignores <=003', () => {
  mig('002_old.sql', 'CREATE TABLE should_not_run (x)');
  mig('005_b.sql', 'ALTER TABLE users ADD COLUMN b TEXT');
  mig('004_a.sql', 'ALTER TABLE users ADD COLUMN a TEXT');
  const db = new Database(':memory:');
  run(db);
  expect(db.pragma('user_version', { simple: true })).toBe(5);
  expect(cols(db, 'users')).toEqual(expect.arrayContaining(['a', 'b']));
  expect(db.prepare("SELECT 1 FROM sqlite_master WHERE name='should_not_run'").get()).toBeUndefined();
});

test('old DB (version 0, columns missing) is healed and stamped', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, display_name TEXT, created_at TEXT, last_login_at TEXT)');
  db.prepare("INSERT INTO users (id, username) VALUES ('u1','a')").run();
  run(db);
  expect(cols(db, 'users')).toEqual(expect.arrayContaining(['oauth_provider', 'role', 'locked_at', 'friend_tag']));
  expect(db.prepare('SELECT username FROM users').get().username).toBe('a');
  expect(db.pragma('user_version', { simple: true })).toBe(BASELINE);
});

test('already-current DB: re-running changes nothing', () => {
  mig('004_a.sql', 'ALTER TABLE users ADD COLUMN a TEXT');
  const db = new Database(':memory:');
  run(db);
  run(db);
  expect(db.pragma('user_version', { simple: true })).toBe(4);
});

test('failing migration rolls back both its changes and the version bump', () => {
  mig('004_ok.sql', 'ALTER TABLE users ADD COLUMN a TEXT');
  mig('005_bad.sql', 'ALTER TABLE users ADD COLUMN b TEXT; INSERT INTO nope VALUES (1);');
  const db = new Database(':memory:');
  expect(() => run(db)).toThrow();
  expect(db.pragma('user_version', { simple: true })).toBe(4);
  expect(cols(db, 'users')).not.toContain('b');
});

test('database newer than the app is refused', () => {
  const db = new Database(':memory:');
  run(db);
  db.pragma('user_version = 9');
  expect(() => run(db)).toThrow(/newer/);
});

test('-- rebuild migration runs with foreign_keys off and restores it', () => {
  mig('004_rebuild.sql', '-- rebuild\nCREATE TABLE t_new (id INTEGER); DROP TABLE IF EXISTS t_new;');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  run(db);
  expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  expect(db.pragma('user_version', { simple: true })).toBe(4);
});

test('concurrent boot: a second connection that read the old version skips what the first applied', () => {
  const file = path.join(dir, 'race.db');
  const migDir = path.join(dir, 'mig');
  fs.mkdirSync(migDir);
  const opts = { dir: migDir, schemaSql, legacy: upgradeLegacy };
  const a = new Database(file);
  const b = new Database(file);
  runMigrations(a, opts);
  fs.writeFileSync(path.join(migDir, '004_a.sql'), 'ALTER TABLE users ADD COLUMN a TEXT');
  // b reads user_version (3), then a applies 004 before b's transaction starts.
  const pragma = b.pragma.bind(b);
  let raced = false;
  b.pragma = (s, o) => {
    const v = pragma(s, o);
    if (!raced && s === 'user_version') { raced = true; runMigrations(a, opts); }
    return v;
  };
  expect(() => runMigrations(b, opts)).not.toThrow();
  expect(pragma('user_version', { simple: true })).toBe(4);
  a.close(); b.close();
});

test('two migration files with the same number are refused before anything runs', () => {
  mig('004_x.sql', 'ALTER TABLE users ADD COLUMN x TEXT');
  mig('004_y.sql', 'ALTER TABLE users ADD COLUMN y TEXT');
  const db = new Database(':memory:');
  expect(() => run(db)).toThrow(/duplicate migration number 4/);
  expect(cols(db, 'users')).not.toEqual(expect.arrayContaining(['x']));
  expect(cols(db, 'users')).not.toEqual(expect.arrayContaining(['y']));
});

test('old DB missing migration 003 gets users.last_login_at before the baseline stamp', () => {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, display_name TEXT, created_at TEXT)');
  run(db);
  expect(cols(db, 'users')).toContain('last_login_at');
  expect(db.pragma('user_version', { simple: true })).toBe(BASELINE);
});

test.each([
  ['games', 'CREATE TABLE games (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, black_player_id TEXT, white_player_id TEXT, black_player_name TEXT NOT NULL, white_player_name TEXT NOT NULL, winner TEXT, reason TEXT, board_size INTEGER NOT NULL, rule_wall INTEGER NOT NULL DEFAULT 0, rule_portal INTEGER NOT NULL DEFAULT 0, moves TEXT, walls TEXT, portals TEXT, started_at TEXT NOT NULL, ended_at TEXT)'],
  ['player_games', 'CREATE TABLE player_games (player_id TEXT NOT NULL, game_id TEXT NOT NULL REFERENCES games(id), PRIMARY KEY (player_id, game_id))'],
])('old DB missing migration 002 (%s without users FK) is refused, not stamped', (_t, ddl) => {
  const db = new Database(':memory:');
  db.exec(ddl);
  expect(() => run(db)).toThrow(/002_rebuild_player_games_and_games_fk\.sql/);
  expect(db.pragma('user_version', { simple: true })).toBe(0);
});

test('007 backfills puzzles.number by creation order (ties by id), unique, and creates puzzle_attempts', () => {
  const real = path.join(__dirname, '../db/migrations');
  fs.readdirSync(real).filter((f) => /^00[4-6]_.+\.sql$/.test(f)).forEach((f) => fs.copyFileSync(path.join(real, f), path.join(dir, f)));
  const db = new Database(':memory:');
  run(db); // schema + 004-006 (no puzzles yet, 007 not copied)
  db.exec("INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES ('u', 'u', 'x', 'U', 't')");
  const ins = db.prepare(`INSERT INTO puzzles (id, author_id, title, rule, board_size, stones, to_move, mode, answers, level, position_hash, created_at, updated_at)
    VALUES (?, 'u', 't', 'freestyle', 15, '[]', 'BLACK', 'sequence', '[]', 'easy', 'h', ?, ?)`);
  ins.run('c', '2026-01-03', '2026-01-03'); ins.run('a', '2026-01-01', '2026-01-01'); ins.run('b2', '2026-01-02', 'x'); ins.run('b1', '2026-01-02', 'x');
  fs.copyFileSync(path.join(real, '007_puzzle_number_and_attempts.sql'), path.join(dir, '007_puzzle_number_and_attempts.sql'));
  run(db);
  expect(db.pragma('user_version', { simple: true })).toBe(7);
  expect(db.prepare('SELECT id FROM puzzles ORDER BY number').all().map((r) => r.id)).toEqual(['a', 'b1', 'b2', 'c']);
  expect(() => db.exec("UPDATE puzzles SET number = 1 WHERE id = 'c'")).toThrow(/UNIQUE/);
  expect(cols(db, 'puzzle_attempts')).toEqual(expect.arrayContaining(['user_id', 'puzzle_id', 'moves', 'correct', 'created_at']));
});
