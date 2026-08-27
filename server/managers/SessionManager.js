'use strict';

/**
 * SessionManager.js — server-side sessions (TODO.md #68).
 *
 * The browser holds ONLY an opaque session id in an HttpOnly cookie; every
 * piece of identity is read back out of the `sessions` table on each socket
 * handshake. This is the mechanism Google/GitHub-style session cookies use,
 * and the reason it was chosen over "same JWT, now in a cookie" is revocation:
 * a signed JWT is valid until it expires no matter what happens afterwards,
 * whereas a row can be marked dead the instant a user logs out, is kicked, or
 * (in future) changes their password.
 *
 * Split of responsibility: db/database.js owns persistence and returns raw
 * rows without judging them; everything policy-shaped lives here — id
 * generation, what "valid" means, TTLs, and the sweep.
 *
 * Manual test checklist:
 *   [ ] createSession → getValidSession returns the same identity
 *   [ ] revokeSession → getValidSession returns null (this is the whole point)
 *   [ ] expired session → getValidSession returns null without being revoked
 *   [ ] guest session works with userId null (no users row exists for guests)
 */

const crypto = require('crypto');

const db     = require('../db/database');
const config = require('../config');
const logger = require('../utils/logger');

// 256 bits, matching the session-id entropy the OWASP Session Management
// Cheat Sheet expects of a value that IS the credential. base64url keeps it
// safe to put in a cookie without escaping.
const SESSION_ID_BYTES = 32;

/**
 * Generate an opaque session id.
 *
 * Deliberately NOT a uuidv4 (which the rest of this codebase uses for entity
 * ids): a v4 uuid carries only 122 random bits and is used elsewhere as a
 * *public* identifier. This value is a secret equivalent to a password, so it
 * gets full 256-bit entropy from a CSPRNG and never appears in a response
 * body, a URL, or a log line.
 */
function generateSessionId() {
  return crypto.randomBytes(SESSION_ID_BYTES).toString('base64url');
}

/**
 * Create and persist a session.
 *
 * @param {object}  user
 * @param {string}  user.userId       real user id, or `guest_xxxx` for guests
 * @param {string}  user.displayName
 * @param {boolean} user.isGuest
 * @param {object}  [opts]
 * @param {number}  [opts.ttlMs]      override the TTL (used by the legacy-JWT
 *                                    migration, which must preserve the old
 *                                    token's REMAINING lifetime rather than
 *                                    silently granting a fresh 7 days)
 * @returns {{ id, userId, displayName, isGuest, expiresAt, ttlMs }}
 */
function createSession({ userId, displayName, isGuest }, opts = {}) {
  const now   = Date.now();
  const ttlMs = opts.ttlMs != null
    ? opts.ttlMs
    : (isGuest ? config.SESSION_GUEST_TTL_MS : config.SESSION_TTL_MS);

  const id        = generateSessionId();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttlMs).toISOString();

  // user_id is stored for guests too (their `guest_xxxx` id), NOT left null:
  // the rest of the app keys players by a non-null userId everywhere — the
  // in-memory sessions Map, room membership, GameEngine player ids. Storing
  // it is only possible because this column has no foreign key to `users`
  // (see the schema comment); is_guest, not nullness, is what marks a guest.
  db.createSession({ id, userId, displayName, isGuest, createdAt, expiresAt });

  return { id, userId, displayName, isGuest, expiresAt, ttlMs };
}

/**
 * Resolve a session id to an identity, or null.
 *
 * Returns null for all four failure modes — unknown id, revoked, expired, and
 * a non-string input — on purpose: the caller (socket auth) must not be able
 * to tell them apart, since distinguishing "revoked" from "never existed"
 * leaks whether an id was ever real.
 *
 * @param {string} sessionId
 * @returns {{ userId, displayName, isGuest, sessionId } | null}
 */
function getValidSession(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null;

  const row = db.getSessionById(sessionId);
  if (!row) return null;
  if (row.revoked_at) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;

  // NOTE: never derive the returned userId from row.id. The session id is a
  // secret; the userId is handed to every other player in the room (chat,
  // lobby, move payloads), so slicing bytes off the id to build one would
  // publish part of the credential. Guests get their own stored `guest_xxxx`
  // id for exactly this reason.
  return {
    userId: row.user_id,
    displayName: row.display_name,
    isGuest: row.is_guest === 1,
    sessionId: row.id,
  };
}

/**
 * Revoke a single session. Idempotent.
 * @returns {boolean} true if this call is what revoked it
 */
function revokeSession(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return false;
  const res = db.revokeSession(sessionId, new Date().toISOString());
  return res.changes > 0;
}

/**
 * Revoke every other live session for a user — the "you were signed in on
 * another device" eviction. `exceptSessionId` spares the session that just
 * won the account, so the new login isn't revoked by its own arrival.
 *
 * No-ops for guests (userId null / `guest_` prefix): a guest's identity IS its
 * session, so there is no account whose other sessions could be evicted, and
 * matching on a null user_id would be meaningless in SQL anyway.
 *
 * @returns {number} how many sessions were revoked
 */
function revokeOtherSessionsForUser(userId, exceptSessionId) {
  if (!userId || userId.startsWith('guest_')) return 0;
  const res = db.revokeSessionsForUser(userId, new Date().toISOString(), exceptSessionId);
  return res.changes || 0;
}

/**
 * Whether a `guestNNNN` display name is currently taken by another live guest
 * session (TODO.md #163). Best-effort uniqueness only — a guest that is offline
 * but still inside its 24h TTL still counts, a guest whose session expired does
 * not. Never considers registered users.
 * @param {string} displayName
 * @returns {boolean}
 */
function isGuestDisplayNameInUse(displayName) {
  return db.hasLiveGuestSessionWithDisplayName(displayName, new Date().toISOString());
}

/** Refresh last_seen_at. Observability only — never gates validity. */
function touchSession(sessionId) {
  try {
    db.touchSession(sessionId, new Date().toISOString());
  } catch (err) {
    // A failed bookkeeping write must never break an otherwise valid login.
    logger.warn('[Session] touch failed:', err.message);
  }
}

/**
 * Delete rows past their expiry. Called at startup and on an interval —
 * unlike JWTs, which vanish on their own, session rows accumulate forever
 * without this.
 * @returns {number} rows deleted
 */
function sweepExpiredSessions() {
  try {
    const res = db.deleteExpiredSessions(new Date().toISOString());
    if (res.changes > 0) logger.info(`[Session] Swept ${res.changes} expired session(s)`);
    return res.changes || 0;
  } catch (err) {
    logger.error('[Session] Sweep failed:', err);
    return 0;
  }
}

module.exports = {
  generateSessionId,
  createSession,
  getValidSession,
  isGuestDisplayNameInUse,
  revokeSession,
  revokeOtherSessionsForUser,
  touchSession,
  sweepExpiredSessions,
};
