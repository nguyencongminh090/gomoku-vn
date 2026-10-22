'use strict';

/**
 * database.js — facade over db/connection.js + db/<domain>.js (#258). Callers and jest mocks keep
 * requiring '../db/database'; add new helpers to the matching domain module and re-export here.
 *
 * Uses better-sqlite3 (synchronous API) — intentional for simplicity.
 * All writes to DB happen ONLY when a game ends (see RoomManager rule #5).
 */

const { db } = require('./connection');

module.exports = {
  db,
  ...require('./users'),
  ...require('./profiles'),
  ...require('./games'),
  ...require('./rankings'),
  ...require('./tournaments'),
};
delete module.exports.withWinnerName; // games-internal, shared with tournaments only (export surface unchanged)
