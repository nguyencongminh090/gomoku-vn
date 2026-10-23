'use strict';

// B348: every test file gets its own throwaway SQLite file unless it picks one itself, so nothing that loads
// db/connection.js transitively can open (and migrate) the real server/db/gomoku.db. connection.js also refuses
// the default path under Jest. Files live under the run's root (db-root.js), removed by globalTeardown.
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.GOMOKU_DB_PATH) {
  const root = process.env.GVN_JEST_DB_ROOT || os.tmpdir();
  process.env.GOMOKU_DB_PATH = path.join(fs.mkdtempSync(path.join(root, 'f-')), 'test.db');
}
