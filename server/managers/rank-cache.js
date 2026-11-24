'use strict';

/**
 * rank-cache.js — every rated member's standing per rule, held in memory (#439).
 *
 * The lobby shows a rank and Elo for each online member in every rule, and filters/sorts tables by
 * seat Elo. `getUserRanking` costs one COUNT per user and category, so the lobby reads this instead:
 * one ordered scan of `ratings` per category, rebuilt only after a rating changed (never per patch).
 *
 * Same numbers as the leaderboard and the profile:
 * - order `rating DESC, user_id` on the raw rating (rankings.js), rank only from RANKING_MIN_GAMES;
 * - shown rating `Math.round(rating)`, provisional when `rd > PROVISIONAL_RD` (seat-rating.js).
 *
 * Freshness: RatingService calls invalidate(category) after its batch commits. With a change listener
 * wired (SocketHandler), a timer rebuilds the dirty categories ≤ REFRESH_MS later and tells the listener
 * which members' rating changed; without one (tests, scripts) the next read rebuilds. A build older than
 * MAX_AGE_MS is redone on read, which catches writes nobody announced (account deletion).
 */

const { CATEGORIES, PROVISIONAL_RD, categoryFor } = require('./RatingService');

const REFRESH_MS = 2_000;
const MAX_AGE_MS = 10 * 60 * 1000;

/** category → { byUser: Map(userId → [rating, rank|null, provisional]), builtAt } */
const cache = new Map();
const dirty = new Set();
const listeners = new Set();
let timer = null;

function _db() { return require('../db/database'); } // lazy: requiring database.js opens the SQLite file

function _build(category) {
  const { db, RANKING_MIN_GAMES } = _db();
  const minGames = RANKING_MIN_GAMES || 1;
  const rows = db.prepare('SELECT user_id, rating, rd, games FROM ratings WHERE category = ? ORDER BY rating DESC, user_id')
    .all(category);
  const byUser = new Map();
  let rank = 0;
  for (const r of rows) {
    byUser.set(r.user_id, [Math.round(r.rating), r.games >= minGames ? ++rank : null, r.rd > PROVISIONAL_RD]);
  }
  const entry = { byUser, builtAt: Date.now() };
  cache.set(category, entry);
  dirty.delete(category);
  return entry;
}

function _get(category) {
  const cur = cache.get(category);
  if (!cur) return _build(category);
  if (Date.now() - cur.builtAt >= MAX_AGE_MS) return _build(category);
  if (dirty.has(category) && listeners.size === 0) return _build(category); // nobody drives the timer
  return cur;
}

/** `[rating, rank|null, provisional]` of a member in a rule, or null (unrated there / not a rated rule). */
function standingOf(userId, rule) {
  const category = categoryFor(rule);
  if (!category || !userId) return null;
  return _get(category).byUser.get(userId) || null;
}

/** Every rule the member has a rating in: `{ rule: [rating, rank|null, provisional] }` (wire shape, #439 S2). */
function ratingsOf(userId) {
  const out = {};
  if (!userId) return out;
  for (const category of CATEGORIES) {
    const s = _get(category).byUser.get(userId);
    if (s) out[category] = s;
  }
  return out;
}

/** Rebuild every dirty category now; tell listeners which members' rating or provisional flag changed. */
function refreshNow() {
  if (timer) { clearTimeout(timer); timer = null; }
  const changed = new Set();
  for (const category of [...dirty]) {
    const before = cache.get(category);
    const after = _build(category).byUser;
    if (!before) continue;
    for (const [userId, s] of after) {
      const old = before.byUser.get(userId);
      if (!old || old[0] !== s[0] || old[2] !== s[2]) changed.add(userId);
    }
    for (const userId of before.byUser.keys()) if (!after.has(userId)) changed.add(userId);
  }
  for (const fn of listeners) {
    try { fn(changed); } catch { /* a listener must not break the others */ }
  }
}

/** A rating in `category` was written (RatingService, after commit). */
function invalidate(category) {
  if (!CATEGORIES.includes(category)) return;
  dirty.add(category);
  if (listeners.size === 0 || timer) return;
  timer = setTimeout(refreshNow, REFRESH_MS);
  if (timer.unref) timer.unref();
}

/** `fn(changedUserIds: Set)` after each timed rebuild (ranks of everyone may have moved too). */
function onChange(fn) {
  listeners.add(fn);
  if (dirty.size && !timer) { // invalidated before anyone listened: nothing scheduled its rebuild
    timer = setTimeout(refreshNow, REFRESH_MS);
    if (timer.unref) timer.unref();
  }
  return () => listeners.delete(fn);
}

/** Tests: forget everything. */
function _reset() {
  cache.clear();
  dirty.clear();
  listeners.clear();
  if (timer) { clearTimeout(timer); timer = null; }
}

module.exports = { standingOf, ratingsOf, invalidate, onChange, refreshNow, REFRESH_MS, MAX_AGE_MS, _reset };
