'use strict';

/** db/users.js — split out of database.js (#258); code moved verbatim. */

const { db } = require('./connection');


// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

/**
 * Insert a new user.
 * @param {{ id, username, passwordHash, displayName, createdAt, oauthProvider?, oauthId? }} user
 */
function createUser({ id, username, passwordHash, displayName, createdAt, oauthProvider = null, oauthId = null }) {
  const stmt = db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, created_at, oauth_provider, oauth_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  return stmt.run(id, username, passwordHash, displayName, createdAt, oauthProvider, oauthId);
}

/**
 * Look up a user by username.
 * @param {string} username
 * @returns {{ id, username, password_hash, display_name, created_at } | undefined}
 */
function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

/**
 * Look up a user by OAuth provider + subject id (TODO.md #91).
 * @param {string} provider e.g. 'google'
 * @param {string} oauthId provider's stable subject id
 * @returns {{ id, username, password_hash, display_name, created_at, oauth_provider, oauth_id } | undefined}
 */
function getUserByOAuthId(provider, oauthId) {
  return db.prepare('SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?').get(provider, oauthId);
}

/**
 * Look up a user by ID.
 * @param {string} id
 * @returns {{ id, username, password_hash, display_name, created_at } | undefined}
 */
function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/**
 * Stamp a user's last_login_at on successful authentication.
 * @param {string} id
 * @param {string} loggedInAt  ISO 8601 timestamp
 */
function updateLastLogin(id, loggedInAt) {
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(loggedInAt, id);
}

// ---------------------------------------------------------------------------
// Session helpers (TODO.md #68 — server-side sessions)
//
// These are the persistence half of managers/SessionManager.js; all policy
// (id generation, expiry/revocation checks) lives there, not here. Nothing in
// this section validates a session — getSessionById returns the raw row,
// including expired and revoked ones, precisely so the caller can tell those
// two cases apart from "no such session".
// ---------------------------------------------------------------------------

/**
 * Insert a new session row.
 * @param {{ id, userId, displayName, isGuest, createdAt, expiresAt }} session
 */
function createSession({ id, userId, displayName, isGuest, createdAt, expiresAt }) {
  return db.prepare(
    `INSERT INTO sessions (id, user_id, display_name, is_guest, created_at, last_seen_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId || null, displayName, isGuest ? 1 : 0, createdAt, createdAt, expiresAt);
}

/**
 * Fetch a session row by id — raw, WITHOUT any expiry/revocation filtering.
 * @returns {{ id, user_id, display_name, is_guest, created_at, last_seen_at, expires_at, revoked_at } | undefined}
 */
function getSessionById(id) {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

/**
 * Is there a live (not revoked, not expired) GUEST session already using this
 * display name? Used to keep the `guestNNNN` names handed out to guests
 * distinct among guests currently around (TODO.md #163). Guest-only on purpose:
 * a registered user may legitimately have picked "guest1234" as their display
 * name, and that must not block the generator forever.
 * @param {string} displayName
 * @param {string} now ISO timestamp to compare expiry against
 * @returns {boolean}
 */
function hasLiveGuestSessionWithDisplayName(displayName, now) {
  return !!db.prepare(
    `SELECT 1 FROM sessions
     WHERE display_name = ? AND is_guest = 1 AND revoked_at IS NULL AND expires_at > ?
     LIMIT 1`
  ).get(displayName, now);
}

/**
 * Mark one session revoked. Idempotent: an already-revoked session keeps its
 * ORIGINAL revoked_at, so re-revoking never rewrites when it first happened.
 */
function revokeSession(id, revokedAt) {
  return db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .run(revokedAt, id);
}

/**
 * Revoke every live session belonging to one user. This is what makes
 * session:kicked an actual eviction rather than a disconnect, and what a
 * future "log out everywhere" / "password changed" flow would call.
 *
 * Guests are excluded by construction: their user_id is null, and `= ?` never
 * matches null in SQL — so this can never mass-revoke unrelated guests.
 *
 * @param {string} [exceptId] session to spare (the one just created)
 */
function revokeSessionsForUser(userId, revokedAt, exceptId) {
  if (!userId) return { changes: 0 };
  return exceptId
    ? db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id != ? AND revoked_at IS NULL')
      .run(revokedAt, userId, exceptId)
    : db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(revokedAt, userId);
}

/** Refresh last_seen_at (observability only — never affects validity). */
function touchSession(id, seenAt) {
  return db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(seenAt, id);
}

/**
 * Delete sessions that expired before `before`. Revoked-but-unexpired rows are
 * deliberately KEPT until their natural expiry — deleting a revoked session
 * early would make its id look merely "unknown" again, which is the same
 * outcome but loses the audit trail of why it stopped working.
 */
function deleteExpiredSessions(before) {
  return db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(before);
}


module.exports = { createUser, getUserByUsername, getUserByOAuthId, getUserById, updateLastLogin, createSession, getSessionById, hasLiveGuestSessionWithDisplayName, revokeSession, revokeSessionsForUser, touchSession, deleteExpiredSessions };
