'use strict';

// B348: jest globalSetup/globalTeardown — one temp root for every test file's DB (see isolate-db.js), removed at the
// end of the run. Workers are killed, not exited, so per-worker cleanup would leak.
const fs = require('fs');
const os = require('os');
const path = require('path');

async function setup() {
  process.env.GVN_JEST_DB_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'gvn-jest-db-'));
}

async function teardown() {
  if (process.env.GVN_JEST_DB_ROOT) fs.rmSync(process.env.GVN_JEST_DB_ROOT, { recursive: true, force: true });
}

module.exports = { setup, teardown };
