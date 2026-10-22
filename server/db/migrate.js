'use strict';

/**
 * migrate.js — versioned schema migrations on PRAGMA user_version (B255).
 *
 * Version 3 is the baseline: schema.sql + legacy-upgrade.js + the historical
 * migrations/001-003 (applied by hand, never by this runner). A file
 * migrations/NNN_name.sql with NNN > 3 runs once, in order, in one transaction
 * together with the user_version bump, so a failure leaves the old version.
 * Shipped files are immutable; fix mistakes with a new file. A file starting
 * with `-- rebuild` toggles foreign_keys OFF around the transaction (table rebuilds).
 */

const fs     = require('fs');
const path   = require('path');
const logger = require('../utils/logger');

const BASELINE = 3;

function listMigrations(dir) {
  const list = fs.readdirSync(dir)
    .map((f) => ({ file: f, m: /^(\d+)_.+\.sql$/.exec(f) }))
    .filter((x) => x.m && Number(x.m[1]) > BASELINE)
    .map((x) => ({ version: Number(x.m[1]), file: x.file }))
    .sort((a, b) => a.version - b.version);
  // Two branches each adding "the next" file would otherwise both run (or one be skipped forever).
  list.forEach((x, i) => {
    if (i && list[i - 1].version === x.version) throw new Error(`[DB] duplicate migration number ${x.version}: ${list[i - 1].file}, ${x.file}`);
  });
  return list;
}

function runMigrations(db, { dir, schemaSql, legacy }) {
  const pending = listMigrations(dir);
  let current = db.pragma('user_version', { simple: true });

  if (current < BASELINE) {
    db.exec(schemaSql);
    legacy(db);
    db.pragma(`user_version = ${BASELINE}`);
    current = BASELINE;
  }

  const latest = pending.length ? pending[pending.length - 1].version : BASELINE;
  if (current > latest) throw new Error(`[DB] database user_version ${current} is newer than this app (${latest})`);

  for (const { version, file } of pending) {
    if (version <= current) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const rebuild = /^\s*--\s*rebuild\b/i.test(sql);
    if (rebuild) db.pragma('foreign_keys = OFF');
    let applied = false;
    try {
      db.transaction(() => {
        // Re-read under the write lock: another connection may have applied it since `current` was read.
        if (db.pragma('user_version', { simple: true }) >= version) return;
        db.exec(sql);
        if (rebuild && db.pragma('foreign_key_check').length) throw new Error('foreign key violation');
        db.pragma(`user_version = ${version}`);
        applied = true;
      }).immediate();
    } finally {
      if (rebuild) db.pragma('foreign_keys = ON');
    }
    if (applied) logger.info(`[DB] Applied migration ${file}`);
  }
}

module.exports = { runMigrations, BASELINE };
