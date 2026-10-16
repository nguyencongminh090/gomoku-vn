'use strict';

/**
 * backup.js — scheduled online backups of the SQLite DB (#254).
 *
 * Uses better-sqlite3 db.backup() (SQLite online-backup API, safe under WAL). Writes to `<name>.tmp`, then
 * renames, so a failed/partial backup is never counted as a good one. Files: mode 600, directory: mode 700.
 * Rotation only touches `gomoku-auto-*.db` — admin.js pre-operation copies (`gomoku-<ISO>.db`) are left alone.
 */

const path   = require('path');
const fs     = require('fs');
const logger = require('../utils/logger');

const PREFIX = 'gomoku-auto-';

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function rotate(dir, keep) {
  const files = fs.readdirSync(dir).filter(f => f.startsWith(PREFIX) && f.endsWith('.db')).sort();
  const old = files.slice(0, Math.max(0, files.length - keep));
  for (const f of old) fs.unlinkSync(path.join(dir, f));
  return old;
}

/** One backup + rotation. Resolves to the final file path. */
async function runBackup(db, { dir, keep = 7 }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const dest = path.join(dir, `${PREFIX}${stamp()}.db`);
  const tmp  = dest + '.tmp';
  try {
    await db.backup(tmp);
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, dest);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* nothing to clean */ }
    throw err;
  }
  rotate(dir, keep);
  return dest;
}

/**
 * Start the unref'd timer. No-op under NODE_ENV=test. Failures are logged and retried next tick.
 * Env: DB_BACKUP_INTERVAL_HOURS (default 24, 0 = off), DB_BACKUP_KEEP (default 7).
 */
function startBackupScheduler(db, { dir, env = process.env } = {}) {
  if (env.NODE_ENV === 'test') return null;
  const hours = Number(env.DB_BACKUP_INTERVAL_HOURS ?? 24);
  const keep  = Math.max(1, parseInt(env.DB_BACKUP_KEEP, 10) || 7);
  if (!(hours > 0)) return null;
  const timer = setInterval(() => {
    runBackup(db, { dir, keep })
      .then(p => logger.info('[DB] backup written', p))
      .catch(err => logger.error('[DB] backup failed:', err));
  }, hours * 3600 * 1000);
  timer.unref();
  return timer;
}

module.exports = { runBackup, startBackupScheduler, rotate, PREFIX };
