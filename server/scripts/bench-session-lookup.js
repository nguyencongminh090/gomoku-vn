'use strict';

/**
 * bench-session-lookup.js — how much does a session lookup cost at handshake?
 * (TODO.md #68)
 *
 * Why this exists: before #68 a socket handshake verified a JWT in pure CPU,
 * touching nothing. Now it reads a row from SQLite, and better-sqlite3 is
 * synchronous — so every lookup blocks the event loop for its duration. This
 * repo has measured bursts of up to 6000 simultaneous connections
 * (docs/stress-test-report.md §10, TODO.md #28/#29), and that burst is exactly
 * where a per-connection blocking read would show up.
 *
 * features/jwt-httponly-cookie/planning.md called for measuring this rather
 * than guessing, and for only adding an in-memory cache if the numbers demand
 * one. This script is that measurement.
 *
 * Run: node server/scripts/bench-session-lookup.js
 */

const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const Database = require('better-sqlite3');

const BURST_SIZES  = [100, 1000, 6000];
const TABLE_SIZES  = [1_000, 100_000];
const WARMUP       = 5_000;

// TODO.md #81: the [100, 1000, 6000] / [1k, 100k] scenario above models the
// #28/#29 stress-test ceiling, not the goToMatch()-reload burst under
// investigation here. That burst is bounded by how many players in ONE
// tournament click "vao tran" near-simultaneously when a round opens, at a
// sessions-table size close to this deployment's actual row count (18 rows
// live as of 2026-08-09) rather than the 100k stress figure.
const REALISTIC_BURST_SIZES = [8, 16, 32, 64];
const REALISTIC_TABLE_SIZES = [20, 100, 500];

// Disk-backed with WAL, matching db/database.js — NOT `:memory:`. An
// in-memory database would flatter the result by removing the page cache and
// WAL behaviour that production actually has. Written to a throwaway temp
// file; the real server/db/gomoku.db is never opened by this script.
const DB_FILE = path.join(
  fs.mkdtempSync(path.join(require('os').tmpdir(), 'gvn-bench-')),
  'bench.db'
);
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));

process.on('exit', () => {
  try {
    db.close();
    fs.rmSync(path.dirname(DB_FILE), { recursive: true, force: true });
  } catch { /* best effort */ }
});

const insert = db.prepare(
  `INSERT INTO sessions (id, user_id, display_name, is_guest, created_at, last_seen_at, expires_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const select = db.prepare('SELECT * FROM sessions WHERE id = ?');
const touch  = db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?');

function seed(rows) {
  db.exec('DELETE FROM sessions');
  const now = new Date().toISOString();
  const exp = new Date(Date.now() + 7 * 864e5).toISOString();
  const ids = [];
  const tx = db.transaction(() => {
    for (let i = 0; i < rows; i++) {
      const id = crypto.randomBytes(32).toString('base64url');
      ids.push(id);
      insert.run(id, `user-${i}`, `Player${i}`, 0, now, now, exp);
    }
  });
  tx();
  return ids;
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

console.log('Session lookup at socket handshake — synchronous SQLite read');
console.log('Node', process.version, '|', process.arch, '\n');

for (const rows of TABLE_SIZES) {
  const ids = seed(rows);

  // Warm the prepared statement + page cache so the first-call cost of
  // compiling SQL is not attributed to the burst.
  for (let i = 0; i < WARMUP; i++) select.get(ids[i % ids.length]);

  console.log(`── sessions table: ${rows.toLocaleString()} rows ──`);

  for (const burst of BURST_SIZES) {
    const samples = new Float64Array(burst);

    const wall0 = process.hrtime.bigint();
    for (let i = 0; i < burst; i++) {
      const id = ids[(i * 7919) % ids.length]; // scattered, not sequential
      const t0 = process.hrtime.bigint();
      const row = select.get(id);
      touch.run(row.last_seen_at, id); // handshake also refreshes last_seen_at
      samples[i] = Number(process.hrtime.bigint() - t0) / 1000; // µs
    }
    const wallMs = Number(process.hrtime.bigint() - wall0) / 1e6;

    const sorted = Array.from(samples).sort((a, b) => a - b);
    console.log(
      `  burst ${String(burst).padStart(5)}: ` +
      `total ${wallMs.toFixed(1).padStart(7)} ms  |  ` +
      `p50 ${percentile(sorted, 0.5).toFixed(1).padStart(6)} µs  ` +
      `p99 ${percentile(sorted, 0.99).toFixed(1).padStart(7)} µs  ` +
      `max ${sorted[sorted.length - 1].toFixed(1).padStart(8)} µs`
    );
  }
  console.log();
}

console.log('Read as: "total" is how long the event loop is blocked if the whole');
console.log('burst arrives at once — the worst case, since real connections arrive spread out.');

console.log('\n\n=== Realistic scale (TODO.md #81 — goToMatch() full-reload burst) ===');
console.log('Sessions-table size close to actual current row count; burst = players');
console.log('in one tournament round clicking "vao tran" near-simultaneously, not the');
console.log('#28/#29 6000-connection stress ceiling.\n');

for (const rows of REALISTIC_TABLE_SIZES) {
  const ids = seed(rows);

  for (let i = 0; i < WARMUP; i++) select.get(ids[i % ids.length]);

  console.log(`── sessions table: ${rows.toLocaleString()} rows ──`);

  for (const burst of REALISTIC_BURST_SIZES) {
    const samples = new Float64Array(burst);

    const wall0 = process.hrtime.bigint();
    for (let i = 0; i < burst; i++) {
      const id = ids[(i * 7919) % ids.length];
      const t0 = process.hrtime.bigint();
      const row = select.get(id);
      touch.run(row.last_seen_at, id);
      samples[i] = Number(process.hrtime.bigint() - t0) / 1000;
    }
    const wallMs = Number(process.hrtime.bigint() - wall0) / 1e6;

    const sorted = Array.from(samples).sort((a, b) => a - b);
    console.log(
      `  burst ${String(burst).padStart(5)}: ` +
      `total ${wallMs.toFixed(1).padStart(7)} ms  |  ` +
      `p50 ${percentile(sorted, 0.5).toFixed(1).padStart(6)} µs  ` +
      `p99 ${percentile(sorted, 0.99).toFixed(1).padStart(7)} µs  ` +
      `max ${sorted[sorted.length - 1].toFixed(1).padStart(8)} µs`
    );
  }
  console.log();
}

console.log('Read as: "total" here is the worst case where every click in a round');
console.log('lands on the same event-loop tick — real clicks spread over seconds,');
console.log('so actual added latency per user is closer to this burst\'s p50/p99.');
