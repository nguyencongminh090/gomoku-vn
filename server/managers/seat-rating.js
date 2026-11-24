'use strict';

/**
 * seat-rating.js — the rating a lobby card shows under a seated member (#364).
 * Same convention as profile.js / rankings.js: rounded, `provisional` when rd > PROVISIONAL_RD
 * (the client appends "?"). Pool = the room's winning rule; null when unrated there or not a rated rule.
 * #439: read from rank-cache (no DB read per lobby entry), so a card and the online roster show the same Elo.
 * Wired as `roomManager.ratingLookup` in SocketHandler.
 */

const rankCache = require('./rank-cache');

/** @returns {{rating:number, provisional:boolean}|null} */
function seatRating(userId, winningRule) {
  const s = rankCache.standingOf(userId, winningRule || 'freestyle');
  return s ? { rating: s[0], provisional: s[2] } : null;
}

module.exports = { seatRating };
