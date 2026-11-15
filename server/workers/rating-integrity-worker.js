'use strict';

/**
 * rating-integrity-worker.js — computes the admin collusion report off the game thread (B384).
 * One-shot: opens its OWN read-only connection (never db/connection.js — that would run migrations
 * and timers a second time), posts the report as a JSON string, exits.
 */

const { parentPort, workerData } = require('worker_threads');
const Database = require('better-sqlite3');
const { buildReport } = require('../utils/rating-integrity-report');

const db = new Database(workerData.dbPath, { readonly: true, fileMustExist: true });
try {
  parentPort.postMessage(JSON.stringify(buildReport(db)));
} finally {
  db.close();
}
