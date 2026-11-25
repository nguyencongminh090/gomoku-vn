'use strict';

/**
 * club-ids-lookup.js — ids of the clubs a member belongs to (pending applicants excluded).
 * Wired as `roomManager.clubIdsOf` in SocketHandler (F453: "Club members" player scope).
 * Read at room create (creator's clubs, snapshotted on the room) and at room join (joiner's clubs),
 * so the DB stays the only source. Statement prepared once, like avatar-lookup.js.
 */

const { db } = require('../db/database');

let stmt = null;

/** @returns {string[]} club ids; [] for a guest / clubless member / unknown id. */
function clubIdsOf(userId) {
  if (!userId) return [];
  if (!stmt) stmt = db.prepare("SELECT club_id FROM club_members WHERE user_id = ? AND role != 'pending'");
  return stmt.all(userId).map((r) => r.club_id);
}

module.exports = { clubIdsOf };
