'use strict';

/**
 * race-migrations.js — real multi-process race on migrate.js (#255 follow-up). Not part of npm test (slow, timing-based).
 *
 *   node server/scripts/race-migrations.js [procs=4] [rounds=3]
 *
 * Each round: temp DB at baseline + a slow 004 (300k-row insert) and a plain 005, then N processes call
 * runMigrations on the same file at the same instant. Pass = every process OK, user_version=5, big has 300000 rows.
 * Before the fix, losers re-ran 004 after the lock and crashed with "duplicate column name: a".
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DB_DIR = path.join(__dirname, '../db');

function migrateOnce(file, dir) {
  const Database = require('better-sqlite3');
  const { runMigrations } = require(path.join(DB_DIR, 'migrate'));
  const { upgradeLegacy } = require(path.join(DB_DIR, 'legacy-upgrade'));
  const db = new Database(file); // default 5 s busy timeout
  runMigrations(db, { dir, schemaSql: fs.readFileSync(path.join(DB_DIR, 'schema.sql'), 'utf8'), legacy: upgradeLegacy });
  return db;
}

if (process.argv[2] === '--child') {
  const [file, dir, startAt] = process.argv.slice(3);
  while (Date.now() < Number(startAt)) { /* barrier: start together */ }
  try { migrateOnce(file, dir); process.stdout.write('OK'); } catch (e) { process.stdout.write(`FAIL ${e.message}`); }
  return;
}

const procs = Number(process.argv[2]) || 4;
const rounds = Number(process.argv[3]) || 3;

function child(file, dir, startAt) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [__filename, '--child', file, dir, String(startAt)], { env: { ...process.env, LOG_LEVEL: 'error' } });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => resolve(out.trim().split('\n').pop()));
  });
}

(async () => {
  let failed = 0;
  for (let r = 1; r <= rounds; r++) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'race-mig-'));
    const dir = path.join(tmp, 'mig');
    const file = path.join(tmp, 't.db');
    fs.mkdirSync(dir);
    const seed = migrateOnce(file, dir);
    seed.pragma('journal_mode = WAL');
    seed.close();
    fs.writeFileSync(path.join(dir, '004_a.sql'), 'ALTER TABLE users ADD COLUMN a TEXT; CREATE TABLE big(x); ' +
      'WITH RECURSIVE c(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM c WHERE i<300000) INSERT INTO big SELECT i FROM c;');
    fs.writeFileSync(path.join(dir, '005_b.sql'), 'ALTER TABLE users ADD COLUMN b TEXT;');

    const startAt = Date.now() + 1500;
    const results = await Promise.all(Array.from({ length: procs }, () => child(file, dir, startAt)));
    const db = new (require('better-sqlite3'))(file, { readonly: true });
    const version = db.pragma('user_version', { simple: true });
    const rows = db.prepare('SELECT COUNT(*) AS n FROM big').get().n;
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });

    const ok = results.every((x) => x === 'OK') && version === 5 && rows === 300000;
    if (!ok) failed++;
    console.log(`round ${r}: ${ok ? 'PASS' : 'FAIL'} user_version=${version} big_rows=${rows} ${JSON.stringify(results)}`);
  }
  console.log(failed ? `${failed}/${rounds} rounds FAILED` : `all ${rounds} rounds passed (${procs} processes each)`);
  process.exitCode = failed ? 1 : 0;
})();
