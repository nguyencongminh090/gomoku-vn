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
  return fs.readdirSync(dir)
    .map((f) => ({ file: f, m: /^(\d+)_.+\.sql$/.exec(f) }))
    .filter((x) => x.m && Number(x.m[1]) > BASELINE)
    .map((x) => ({ version: Number(x.m[1]), file: x.file }))
    .sort((a, b) => a.version - b.version);
}

function runMigrations(db, { dir, schemaSql, legacy }) {
  let current = db.pragma('user_version', { simple: true });

  if (current < BASELINE) {
    db.exec(schemaSql);
    legacy(db);
    db.pragma(`user_version = ${BASELINE}`);
    current = BASELINE;
  }

  const pending = listMigrations(dir);
  const latest = pending.length ? pending[pending.length - 1].version : BASELINE;
  if (current > latest) throw new Error(`[DB] database user_version ${current} is newer than this app (${latest})`);

  for (const { version, file } of pending) {
    if (version <= current) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const rebuild = /^\s*--\s*rebuild\b/i.test(sql);
    if (rebuild) db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(sql);
        if (rebuild && db.pragma('foreign_key_check').length) throw new Error('foreign key violation');
        db.pragma(`user_version = ${version}`);
      }).immediate();
    } finally {
      if (rebuild) db.pragma('foreign_keys = ON');
    }
    logger.info(`[DB] Applied migration ${file}`);
  }
}

module.exports = { runMigrations, BASELINE };
