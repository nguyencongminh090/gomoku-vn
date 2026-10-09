'use strict';

/**
 * Achievements — badges + win streak, derived on read from RATED games only (#199, decided
 * 2026-10-09). Pure functions; nothing is stored. `results` is newest-first 'win'|'loss'|'draw'.
 * A loss or a draw ends a streak.
 */

const STREAK_WINDOW = 1000; // newest rated games considered for the streak

/** Badge ids → how they're earned. Order = display order. */
const BADGES = [
  { id: 'first_win', test: (s) => s.rankedWins >= 1 },
  { id: 'wins_100', test: (s) => s.rankedWins >= 100 },
  { id: 'wins_1000', test: (s) => s.rankedWins >= 1000 },
  { id: 'top_500', test: (s) => s.bestRank != null && s.bestRank <= 500 },
  { id: 'top_10', test: (s) => s.bestRank != null && s.bestRank <= 10 },
];
/** Win-count badges come from game history, so they follow the owner's "hide history" switch. */
const HISTORY_BADGES = new Set(['first_win', 'wins_100', 'wins_1000']);

/** @param {string[]} results newest first @returns {{current:number, best:number}} */
function streaks(results) {
  let current = 0;
  while (current < results.length && results[current] === 'win') current++;
  let best = 0;
  let run = 0;
  for (const r of results) {
    run = r === 'win' ? run + 1 : 0;
    if (run > best) best = run;
  }
  return { current, best };
}

/**
 * @param {{rankedWins:number, bestRank:number|null}} stats bestRank = best (lowest) rank over all categories, null if unranked
 * @param {{showHistory:boolean}} opts
 * @returns {string[]} earned badge ids
 */
function badges(stats, { showHistory }) {
  return BADGES.filter((b) => (showHistory || !HISTORY_BADGES.has(b.id)) && b.test(stats)).map((b) => b.id);
}

module.exports = { STREAK_WINDOW, BADGES, streaks, badges };
