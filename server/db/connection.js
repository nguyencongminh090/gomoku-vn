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
const DEFAULT_DB_PATH = path.join(__dirname, 'gomoku.db');
const DB_PATH     = process.env.GOMOKU_DB_PATH || DEFAULT_DB_PATH;
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// B348: a test must never open (and migrate) the live file. tests/setup/isolate-db.js sets GOMOKU_DB_PATH per file.
if (process.env.JEST_WORKER_ID && path.resolve(DB_PATH) === DEFAULT_DB_PATH) {
  throw new Error('[DB] refusing to open server/db/gomoku.db under Jest; set GOMOKU_DB_PATH');
}

// ---------------------------------------------------------------------------
// Initialize
// ---------------------------------------------------------------------------

const db = new Database(DB_PATH);
require('./slow-query').install(db); // every statement is timed; > SLOW_QUERY_MS is logged (B384)

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('trusted_schema = OFF'); // schema functions/views can't run unsafe SQL from a tampered file (B259)
// Page cache (B384): the 2 MB default makes any scan of the wide `games` rows re-read through the OS —
// 64 MB cut unindexed scans ~3x on a 90 MB DB (16.6 -> 5.6 ms). Allocated on demand, so small DBs cost nothing.
// mmap_size stays 0: benched no faster than the cache, and a failed mapped read is a crash, not an error.
const CACHE_KB = Number(process.env.SQLITE_CACHE_KB) > 0 ? Math.floor(Number(process.env.SQLITE_CACHE_KB)) : 65536;
db.pragma(`cache_size = -${CACHE_KB}`);

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

// Prepared-statement cache (B379): db.prepare costs far more than running the query, and helpers ran
// it on every call. Keyed by SQL text — use only for SQL drawn from a bounded set of texts (constants,
// fixed column lists, option-built WHERE). Per-call `IN (?,?,…)` lists stay on db.prepare. The cap is a
// safety net: past it, statements are prepared but not kept. Statements here must stay in default mode
// (no .pluck/.raw/.expand — shared state) and must not be iterate()d (a busy statement can't re-enter).
const STMT_CACHE_MAX = 500;
const stmtCache = new Map();
function stmt(sql) {
  let s = stmtCache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    if (stmtCache.size < STMT_CACHE_MAX) stmtCache.set(sql, s);
  }
  return s;
}

module.exports = { db, DB_PATH, stmt, STMT_CACHE_MAX };
