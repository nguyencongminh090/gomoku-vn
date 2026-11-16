'use strict';

/**
 * db/slow-query.js — times every statement run on the game thread (B384).
 *
 * better-sqlite3 is synchronous: a read that takes N ms delays every move ack by N ms. This wraps
 * Statement.get/all/run once per process, logs calls slower than SLOW_QUERY_MS (default 5, 0 = off)
 * and keeps per-SQL totals so `stats()` can list the top offenders. Cost: two hrtime reads per call
 * (~0.1 µs). iterate() is not wrapped (its time is spread over the caller's loop).
 */

const logger = require('../utils/logger');

const MAX_TRACKED = 300;                 // distinct SQL texts kept in the totals (cap = memory bound)
const LOG_EVERY_MS = 10_000;             // per SQL text: at most one log line per window
let thresholdMs = Number(process.env.SLOW_QUERY_MS ?? 5);
if (!Number.isFinite(thresholdMs) || thresholdMs < 0) thresholdMs = 5;

const totals = new Map();                // sql → { n, slow, totalMs, maxMs, lastLog }
let installed = false;

function record(sql, kind, ms, now = Date.now()) {
  let t = totals.get(sql);
  if (!t) {
    if (totals.size >= MAX_TRACKED) t = null;
    else { t = { n: 0, slow: 0, totalMs: 0, maxMs: 0, lastLog: 0 }; totals.set(sql, t); }
  }
  if (t) { t.n++; t.totalMs += ms; if (ms > t.maxMs) t.maxMs = ms; }
  if (!thresholdMs || ms < thresholdMs) return false;
  if (t) {
    t.slow++;
    if (now - t.lastLog < LOG_EVERY_MS) return true; // counted, not logged again (a hot slow query must not flood the log)
    t.lastLog = now;
  }
  logger.warn('[DB] slow query', { ms: +ms.toFixed(1), kind, sql: sql.replace(/\s+/g, ' ').slice(0, 300) });
  return true;
}

/** Patch the Statement prototype of this better-sqlite3 build. Idempotent. */
function install(db) {
  if (installed) return;
  installed = true;
  const proto = Object.getPrototypeOf(db.prepare('SELECT 1'));
  for (const kind of ['get', 'all', 'run']) {
    const orig = proto[kind];
    proto[kind] = function timed(...args) {
      const t0 = process.hrtime.bigint();
      try { return orig.apply(this, args); }
      finally { record(this.source, kind, Number(process.hrtime.bigint() - t0) / 1e6); }
    };
  }
}

/** Top statements by worst single call. @returns {{sql,n,slow,totalMs,maxMs,avgMs}[]} */
function stats(limit = 20) {
  return [...totals].map(([sql, t]) => ({ sql, n: t.n, slow: t.slow, totalMs: t.totalMs, maxMs: t.maxMs, avgMs: t.totalMs / t.n }))
    .sort((a, b) => b.maxMs - a.maxMs).slice(0, limit);
}

function reset() { totals.clear(); }
function setThreshold(ms) { thresholdMs = ms; }

module.exports = { install, record, stats, reset, setThreshold, MAX_TRACKED, LOG_EVERY_MS };
