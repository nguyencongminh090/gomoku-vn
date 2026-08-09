'use strict';

/**
 * oauth-unique-constraint.test.js — TODO.md #94.
 *
 * idx_users_oauth was a plain index, so nothing at the DB layer stopped two
 * `users` rows from sharing the same (oauth_provider, oauth_id) — the actual
 * bug was a TOCTOU race in /google/callback (see auth-google-oauth.test.js
 * for the route-level retry behavior), but the fix here is the DB
 * constraint that makes the race fail loudly instead of silently.
 *
 * Uses a real SQLite connection (not a mocked `../db/database`), same
 * approach as save-game.test.js — mocking the DB module would assert
 * nothing about whether the index is actually UNIQUE.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const RealDatabase = require('better-sqlite3');

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

describe('idx_users_oauth — fresh DB (no pre-existing duplicates)', () => {
  let database;

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('better-sqlite3', () => function MockedDatabase() {
      return new RealDatabase(':memory:');
    });
    database = require('../db/database');
  });

  test('index is created as UNIQUE at the sqlite catalog level', () => {
    const idx = database.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_users_oauth'"
    ).get();
    expect(idx.sql).toMatch(/CREATE UNIQUE INDEX/i);
  });

  test('a second row with the same (oauth_provider, oauth_id) is rejected', () => {
    database.createUser({
      id: 'u1', username: 'alice', passwordHash: 'h', displayName: 'Alice',
      createdAt: 'now', oauthProvider: 'google', oauthId: 'sub-1',
    });

    expect(() => {
      database.createUser({
        id: 'u2', username: 'bob', passwordHash: 'h', displayName: 'Bob',
        createdAt: 'now', oauthProvider: 'google', oauthId: 'sub-1',
      });
    }).toThrow(/UNIQUE constraint failed/);
  });

  test('a different oauth_id for the same provider is unaffected', () => {
    expect(() => {
      database.createUser({
        id: 'u3', username: 'carol', passwordHash: 'h', displayName: 'Carol',
        createdAt: 'now', oauthProvider: 'google', oauthId: 'sub-2',
      });
    }).not.toThrow();
  });

  test('two password accounts (NULL, NULL) never collide with each other', () => {
    expect(() => {
      database.createUser({ id: 'u4', username: 'dave', passwordHash: 'h', displayName: 'Dave', createdAt: 'now' });
      database.createUser({ id: 'u5', username: 'erin', passwordHash: 'h', displayName: 'Erin', createdAt: 'now' });
    }).not.toThrow();
  });
});

describe('idx_users_oauth — existing DB with a duplicate pair already present', () => {
  let tmpFile, database, logger;

  beforeAll(() => {
    tmpFile = path.join(os.tmpdir(), `gvn-oauth-dup-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);

    // Seed a pre-#94 DB: plain (non-unique) index + a duplicate pair already
    // sitting in `users`, simulating the race having actually been hit once.
    const seed = new RealDatabase(tmpFile);
    seed.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL, created_at TEXT NOT NULL, last_login_at TEXT,
        oauth_provider TEXT, oauth_id TEXT
      );
      CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_id);
    `);
    const insert = seed.prepare(
      `INSERT INTO users (id, username, password_hash, display_name, created_at, oauth_provider, oauth_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run('dup-1', 'alice_a', 'h', 'Alice', 'now', 'google', 'dup-sub');
    insert.run('dup-2', 'alice_b', 'h', 'Alice', 'now', 'google', 'dup-sub');
    seed.close();

    jest.resetModules();
    jest.doMock('better-sqlite3', () => function MockedDatabase() {
      return new RealDatabase(tmpFile);
    });
    jest.doMock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    database = require('../db/database');
    logger = require('../utils/logger');
  });

  afterAll(() => {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(tmpFile + suffix); } catch { /* not present */ }
    }
  });

  test('server boots without throwing despite the duplicate pair', () => {
    expect(database.db).toBeDefined();
  });

  test('UNIQUE upgrade is skipped — index stays plain, both duplicate rows survive', () => {
    const idx = database.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_users_oauth'"
    ).get();
    expect(idx.sql).not.toMatch(/UNIQUE/i);

    const rows = database.db.prepare(
      "SELECT id FROM users WHERE oauth_provider = 'google' AND oauth_id = 'dup-sub'"
    ).all();
    expect(rows).toHaveLength(2);
  });

  test('logs an error naming the duplicate pair for manual cleanup', () => {
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('duplicate'));
  });

  test('once duplicates are cleaned up, a later restart installs the UNIQUE index', () => {
    database.db.prepare("DELETE FROM users WHERE id = 'dup-2'").run();

    jest.resetModules();
    jest.doMock('better-sqlite3', () => function MockedDatabase() {
      return new RealDatabase(tmpFile);
    });
    jest.doMock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
    const reloaded = require('../db/database');

    const idx = reloaded.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_users_oauth'"
    ).get();
    expect(idx.sql).toMatch(/CREATE UNIQUE INDEX/i);
  });
});
