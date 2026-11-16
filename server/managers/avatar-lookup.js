'use strict';

/**
 * avatar-lookup.js — a member's avatar URL for room / lobby / online-list payloads.
 * Wired as `roomManager.avatarLookup` in SocketHandler. Same URL shape as profile.js.
 *
 * Hot path: called once per online user on every online-list build and once per seated player on
 * every lobby flush. It used to go through `getUserById` — `SELECT *` re-prepared on every call —
 * which made ~1000 online users cost 60–300 ms of blocked event loop per build, stalling every
 * game on the server (perf/play-lag, 2026-11-14). The statement is prepared once and reads one
 * column; the DB stays the only source (no cache to invalidate on avatar change).
 */

const { db } = require('../db/database');

let stmt = null;

/** @returns {string|null} `/api/profile/avatar/<id>.webp?v=<avatar_v>`, null when no avatar / no user. */
function avatarUrlFor(userId) {
  if (!userId) return null;
  if (!stmt) stmt = db.prepare('SELECT avatar_v FROM users WHERE id = ?');
  const row = stmt.get(userId);
  return row && row.avatar_v ? `/api/profile/avatar/${userId}.webp?v=${row.avatar_v}` : null;
}

module.exports = { avatarUrlFor };
