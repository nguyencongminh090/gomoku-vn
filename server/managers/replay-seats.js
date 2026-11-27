'use strict';

/**
 * replay-seats.js — public per-seat player info for the replay endpoints (#500).
 *
 * `/api/games/:id` and `/api/tournament-games/:id` are unauthenticated, so the internal
 * user id is never a field here; it appears only inside `avatarUrl`, the same URL shape
 * rankings and the profile card already serve publicly (user decision 2026-11-27).
 * Guests and deleted accounts get `null` and the client shows the seat stone instead.
 * `rating` = the seat's rating when the game was played (rating_history.rating_before),
 * null when the game wasn't rated.
 */

const { db } = require('../db/database');
const { avatarUrlFor } = require('./avatar-lookup');

let userStmt = null;
let ratingStmt = null;

function seat(gameId, userId) {
  if (!userId) return null;
  if (!userStmt) userStmt = db.prepare('SELECT username FROM users WHERE id = ?');
  const user = userStmt.get(userId);
  if (!user) return null;
  if (!ratingStmt) {
    ratingStmt = db.prepare('SELECT rating_before FROM rating_history WHERE game_id = ? AND user_id = ? ORDER BY id LIMIT 1');
  }
  const r = ratingStmt.get(gameId, userId);
  return {
    username: user.username,
    avatarUrl: avatarUrlFor(userId),
    rating: r ? Math.round(r.rating_before) : null,
  };
}

/**
 * @param {string} gameId
 * @param {{black: string|null, white: string|null}|undefined} ids internal seat user ids
 * @returns {{black: object|null, white: object|null}}
 */
function replaySeats(gameId, ids) {
  return {
    black: seat(gameId, ids && ids.black),
    white: seat(gameId, ids && ids.white),
  };
}

module.exports = { replaySeats };
