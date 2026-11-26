'use strict';

/**
 * AbandonmentService.js — repeat-leaver limit (#495, features/presence-status Q5 A / Q12 A).
 *
 * A rated game lost by abandonment ('abandon': the absence budget ran out) or aborted because a player left
 * before both had acted ('abort') is recorded against the player who left. Three or more in 24 h make a
 * repeat leaver: their absence budget is halved (floor 15 s) and quick match is closed to them for 10 minutes
 * after the latest one. Outage voids, both-players-gone and server restarts are never recorded.
 *
 * Members: table `abandonment_events` (migration 027), pruned after 7 days. Guests cannot play rated games
 * today; should one ever be recorded, it is kept in memory per guest id only — never per IP (CGNAT: members
 * behind one address would share a penalty, #372 lesson / proxy-client-ip-rate-limit).
 * Every call is best-effort: a DB error is logged and never breaks the game path.
 */

const database = require('../db/database');
const logger = require('../utils/logger');

const db = () => database.db;
const DAY_MS = 24 * 60 * 60 * 1000;
const REPEAT_COUNT = 3;
const COOLDOWN_MS = 10 * 60 * 1000;
const KEEP_MS = 7 * DAY_MS;
const BUDGET_FLOOR_MS = 15_000;
const KINDS = ['abandon', 'abort'];

/** Guests: guest id → event times (ms). */
const guestEvents = new Map();
const isGuestId = (id) => typeof id === 'string' && id.startsWith('guest_');

function record(userId, gameId, kind, now = Date.now()) {
  if (!userId || !KINDS.includes(kind)) return false;
  if (isGuestId(userId)) {
    const list = (guestEvents.get(userId) || []).filter((t) => now - t < DAY_MS);
    list.push(now);
    guestEvents.set(userId, list);
    return true;
  }
  try {
    db().prepare('INSERT INTO abandonment_events (user_id, game_id, kind, at) VALUES (?, ?, ?, ?)').run(userId, String(gameId || ''), kind, now);
    return true;
  } catch (err) {
    logger.warn('[Abandonment] record failed', { err: err.message });
    return false;
  }
}

/** @returns {{ count: number, lastAt: number|null }} events in the last 24 h */
function recent(userId, now = Date.now()) {
  if (isGuestId(userId)) {
    const list = (guestEvents.get(userId) || []).filter((t) => now - t < DAY_MS);
    return { count: list.length, lastAt: list.length ? Math.max(...list) : null };
  }
  try {
    const r = db().prepare('SELECT COUNT(*) AS n, MAX(at) AS last FROM abandonment_events WHERE user_id = ? AND at > ?').get(userId, now - DAY_MS);
    return { count: r ? r.n : 0, lastAt: r && r.last != null ? r.last : null };
  } catch (err) {
    logger.warn('[Abandonment] read failed', { err: err.message });
    return { count: 0, lastAt: null };
  }
}

function isRepeatLeaver(userId, now = Date.now()) {
  return recent(userId, now).count >= REPEAT_COUNT;
}

/** The absence budget for this player: halved (floor 15 s) for a repeat leaver. */
function budgetFor(userId, baseMs, now = Date.now()) {
  return isRepeatLeaver(userId, now) ? Math.max(BUDGET_FLOOR_MS, Math.round(baseMs / 2)) : baseMs;
}

/** Milliseconds left of the quick-match cooldown (0 = may queue). */
function cooldownLeftMs(userId, now = Date.now()) {
  const { count, lastAt } = recent(userId, now);
  if (count < REPEAT_COUNT || lastAt === null) return 0;
  return Math.max(0, lastAt + COOLDOWN_MS - now);
}

/** Drop events older than 7 days (members) and older than 24 h (guests). */
function prune(now = Date.now()) {
  for (const [id, list] of guestEvents) {
    const keep = list.filter((t) => now - t < DAY_MS);
    if (keep.length) guestEvents.set(id, keep); else guestEvents.delete(id);
  }
  try {
    return db().prepare('DELETE FROM abandonment_events WHERE at < ?').run(now - KEEP_MS).changes;
  } catch (err) {
    logger.warn('[Abandonment] prune failed', { err: err.message });
    return 0;
  }
}

module.exports = {
  record, recent, isRepeatLeaver, budgetFor, cooldownLeftMs, prune,
  REPEAT_COUNT, COOLDOWN_MS, KEEP_MS, BUDGET_FLOOR_MS, _guestEvents: guestEvents,
};
