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
