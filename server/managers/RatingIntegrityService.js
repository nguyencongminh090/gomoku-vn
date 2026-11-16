'use strict';

/**
 * RatingIntegrityService.js — read-only collusion signals for the admin page (#249). Computes on demand from
 * rating_history; flags are a prompt for human review and never change a rating. Perm: rating.integrity (admin only). Output is a signal to read — nothing here acts on a player.
 *
 * The report reads all of rating_history and runs graph analysis (265 ms on a 39k-row history): the
 * HTTP route uses reportJson(), which computes it in a worker thread so no move ack waits on it (B384).
 */

const path = require('path');
const worker_threads = require('worker_threads');
const database = require('../db/database');
const { DB_PATH } = require('../db/connection');
const roles = require('../utils/roles');
const { buildReport } = require('../utils/rating-integrity-report');

const WORKER_FILE = path.join(__dirname, '..', 'workers', 'rating-integrity-worker.js');
const WORKER_TIMEOUT_MS = 30_000;

class RatingIntegrityError extends Error {
  constructor(code, status, message) { super(message); this.name = 'RatingIntegrityError'; this.code = code; this.status = status; }
}

function assertAllowed(staffId) {
  if (!roles.can(staffId, 'rating.integrity')) throw new RatingIntegrityError('CHEAT_FORBIDDEN', 403, 'Bạn không có quyền.');
}

/** Synchronous report on the shared connection — blocks the caller's thread. Scripts and tests only. */
function report(staffId) {
  assertAllowed(staffId);
  return buildReport(database.db);
}

let inFlight = null; // one computation at a time; concurrent requests share its result

function runWorker() {
  return new Promise((resolve, reject) => {
    const worker = new worker_threads.Worker(WORKER_FILE, { workerData: { dbPath: DB_PATH } });
    let done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v); };
    const timer = setTimeout(() => { worker.terminate(); finish(reject, new Error('rating-integrity worker timed out')); }, WORKER_TIMEOUT_MS);
    worker.once('message', (json) => finish(resolve, json));
    worker.once('error', (err) => finish(reject, err));
    worker.once('exit', (code) => finish(reject, new Error(`rating-integrity worker exited (${code}) without a result`)));
  });
}

/**
 * The same report as a JSON string, computed off the game thread. The permission check stays
 * synchronous (throws RatingIntegrityError before any work starts).
 * @returns {Promise<string>}
 */
function reportJson(staffId) {
  assertAllowed(staffId);
  if (!inFlight) inFlight = runWorker().finally(() => { inFlight = null; });
  return inFlight;
}

module.exports = { report, reportJson, RatingIntegrityError };
