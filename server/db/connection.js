'use strict';

/**
 * db/connection.js — opens the single SQLite connection, runs migrations, starts timers (#258).
 * Every db/<domain>.js module requires this; never open a second connection (breaks temp-DB tests).
 */

const path        = require('path');
const fs          = require('fs');
const Database    = require('better-sqlite3');
const logger      = require('../utils/logger');
const { runMigrations } = require('./migrate');
const { upgradeLegacy, ensureOauthUniqueIndex } = require('./legacy-upgrade');

// DB file lives in server/db/gomoku.db
const DB_PATH     = process.env.GOMOKU_DB_PATH || path.join(__dirname, 'gomoku.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('trusted_schema = OFF'); // schema functions/views can't run unsafe SQL from a tampered file (B259)

// Versioned schema (B255): schema.sql + legacy-upgrade bring pre-versioning files to the baseline, then migrations/NNN_*.sql
// run in order. See migrate.js. Add schema changes as a new migration file, never as an inline ALTER here.
runMigrations(db, {
  dir: path.join(__dirname, 'migrations'),
  schemaSql: fs.readFileSync(SCHEMA_PATH, 'utf8'),
  legacy: upgradeLegacy,
});
// Not version-gated: retries the UNIQUE upgrade each boot until oauth duplicates are cleaned up (#94/#100).
ensureOauthUniqueIndex(db);

// Periodic WAL checkpoint to prevent unbounded growth. unref(): the HTTP server keeps the process
// alive; this timer must not, or every script/test that loads the DB never exits on its own.
const walTimer = setInterval(() => {
  try {
    db.pragma('wal_checkpoint(PASSIVE)');
  } catch (err) {
    logger.error('[DB] WAL checkpoint failed:', err);
  }
}, 60 * 60 * 1000); // Every hour
walTimer.unref();

// Daily online backup + rotation (#254). No-op in tests.
require('./backup').startBackupScheduler(db, { dir: path.join(__dirname, 'backups') });

logger.info('[DB] SQLite initialized at', DB_PATH);

module.exports = { db, DB_PATH };
