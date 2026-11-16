'use strict';

/**
 * seat-rating.js — the rating a lobby card shows under a seated member (#364).
 * Same convention as profile.js / rankings.js: rounded, `provisional` when rd > PROVISIONAL_RD
 * (the client appends "?"). Pool = the room's winning rule; null when unrated there or not a rated rule.
 * Wired as `roomManager.ratingLookup` in SocketHandler.
 */

const { db } = require('../db/database');
const { categoryFor, PROVISIONAL_RD } = require('./RatingService');

let stmt = null;

/** @returns {{rating:number, provisional:boolean}|null} */
function seatRating(userId, winningRule) {
  const category = categoryFor(winningRule || 'freestyle');
  if (!category || !userId) return null;
  if (!stmt) stmt = db.prepare('SELECT rating, rd FROM ratings WHERE user_id = ? AND category = ?');
  const row = stmt.get(userId, category);
  return row ? { rating: Math.round(row.rating), provisional: row.rd > PROVISIONAL_RD } : null;
}

module.exports = { seatRating };
