'use strict';

/**
 * schema-sql-safety.test.js — schema.sql must be safe to run unconditionally
 * against BOTH a fresh database and an existing one from before the latest
 * migration.
 *
 * database.js runs schema.sql's db.exec(schema) on every single startup,
 * unconditionally, BEFORE any additive-migration ALTER TABLE code — this is
 * what makes schema.sql's own CREATE TABLE IF NOT EXISTS statements safe (a
 * no-op against an existing table). But that same "runs on every startup"
 * property means schema.sql must never contain a statement that assumes a
 * column only a later ALTER TABLE would add — CREATE INDEX IF NOT EXISTS is
 * NOT conditional on the columns it references existing, so one referencing
 * a not-yet-migrated column throws immediately, before database.js's own
 * migration code (which runs after this file's exec()) ever gets a chance to
 * add it.
 *
 * Regression test for exactly that: schema.sql briefly (TODO.md #91) shipped
 * `CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_id)` inside
 * itself — safe against a fresh DB (the CREATE TABLE right above it already
 * includes those columns), but it threw against any pre-#91 database, which
 * is every already-deployed one. Caught by running the real test suite
 * against a real pre-migration users table, not by any existing test — this
 * suite exists so it can't silently come back.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

const SCHEMA_PATH = path.join(__dirname, '..', 'db', 'schema.sql');
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');

function tempDbPath() {
  return path.join(os.tmpdir(), `gomoku-schema-safety-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('schema.sql', () => {
  test('runs cleanly against a brand-new (empty) database', () => {
    const dbPath = tempDbPath();
    const db = new Database(dbPath);
    try {
      expect(() => db.exec(schema)).not.toThrow();
    } finally {
      db.close();
      fs.rmSync(dbPath, { force: true });
    }
  });

  test('runs cleanly against a pre-#91 database — users table without oauth_provider/oauth_id', () => {
    const dbPath = tempDbPath();
    const db = new Database(dbPath);
    try {
      // The exact shape every already-deployed database has: no
      // oauth_provider/oauth_id columns, since those were added after this
      // table already existed in production.
      db.exec(`
        CREATE TABLE users (
          id           TEXT PRIMARY KEY,
          username     TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL,
          created_at   TEXT NOT NULL,
          last_login_at TEXT
        );
      `);
      db.prepare(
        'INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('u1', 'alice', '$2b$12$x', 'Alice', new Date().toISOString());

      expect(() => db.exec(schema)).not.toThrow();

      // schema.sql's CREATE TABLE IF NOT EXISTS must not have touched the
      // existing table (real additive migration is database.js's job, not
      // schema.sql's) — the pre-existing row must be untouched.
      const row = db.prepare('SELECT * FROM users WHERE id = ?').get('u1');
      expect(row.username).toBe('alice');
      expect(row.oauth_provider).toBeUndefined();
    } finally {
      db.close();
      fs.rmSync(dbPath, { force: true });
    }
  });

  test('does not itself create idx_users_oauth — that is database.js\'s job, after its migration', () => {
    // schema.sql must never contain a CREATE INDEX (or any non-CREATE-TABLE
    // statement) referencing oauth_provider/oauth_id, since it runs
    // unconditionally before database.js's ALTER TABLE migration. Strip
    // comments first — this repo's schema.sql documents that exact
    // constraint in prose right next to it, which would otherwise false-
    // positive a naive grep over raw statement text.
    const withoutComments = schema.replace(/--.*$/gm, '');
    const statements = withoutComments.split(';').map((s) => s.trim()).filter(Boolean);
    const badStatement = statements.find(
      (s) => /oauth_provider|oauth_id/i.test(s) && !/CREATE\s+TABLE/i.test(s)
    );
    expect(badStatement).toBeUndefined();
  });
});
