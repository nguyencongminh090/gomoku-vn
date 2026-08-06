'use strict';

/**
 * series.js — pure functions for scoring and deciding a pairing's multi-game
 * series (TODO.md #50 / instruction.md B50). Extends the base tournament
 * feature's "one pairing = one game" model to "one pairing = N games",
 * without changing how a decided pairing.result is consumed downstream
 * (Swiss standings, Double Elimination bracket resolution — see
 * features/tournament-match-series/planning.md "Ghi chú thuật ngữ").
 *
 * No side effects, no lookups by id — same testability convention as
 * PairingLifecycle.js (see that file's header).
 */

const VALID_SERIES_MODES = ['single', 'fixedCount', 'raceToMargin'];

/**
 * Win = 1, draw = 0.5 each, loss = 0 (planning.md decision 1/2) — summed
 * across every game played so far.
 *
 * @param {Array<{index:number, winnerEntryId:string|null, endedAt:string}>} games
 * @param {string} player1EntryId
 * @param {string} player2EntryId
 * @returns {{[entryId: string]: number}}
 */
function computeSeriesScore(games, player1EntryId, player2EntryId) {
  const score = { [player1EntryId]: 0, [player2EntryId]: 0 };
  for (const game of games) {
    if (game.winnerEntryId === null) {
      score[player1EntryId] += 0.5;
      score[player2EntryId] += 0.5;
    } else {
      score[game.winnerEntryId] += 1;
    }
  }
  return score;
}

/**
 * Decide whether the series is over yet and who won it.
 *
 * `winnerEntryId: null` means two different things depending on
 * `seriesComplete` — callers MUST check `seriesComplete` first:
 *   - seriesComplete=false: not decided yet, winnerEntryId is meaningless.
 *   - seriesComplete=true, winnerEntryId=null: the series itself ended tied
 *     (only possible in 'single' or 'fixedCount' mode — 'raceToMargin' can
 *     never complete tied, since margin > 0 forces scoreA !== scoreB).
 *
 * @param {Array<{index:number, winnerEntryId:string|null, endedAt:string}>} games
 * @param {{seriesMode:string, seriesGameCount:?number, seriesTargetScore:?number, seriesMargin:?number}} ruleSet
 * @param {string} player1EntryId
 * @param {string} player2EntryId
 * @returns {{seriesComplete: boolean, winnerEntryId: string|null}}
 */
function evaluateSeries(games, ruleSet, player1EntryId, player2EntryId) {
  const mode = ruleSet.seriesMode || 'single';
  if (!VALID_SERIES_MODES.includes(mode)) {
    throw new Error(`evaluateSeries: unknown seriesMode "${mode}"`);
  }

  const score = computeSeriesScore(games, player1EntryId, player2EntryId);
  const scoreA = score[player1EntryId];
  const scoreB = score[player2EntryId];

  // 'single' behaves exactly like fixedCount with a hardcoded count of 1 —
  // reproduces today's one-game-per-pairing behavior exactly (instruction.md
  // B50 step 2), regardless of whatever seriesGameCount happens to be set to.
  const requiredGames = mode === 'single' ? 1 : ruleSet.seriesGameCount;

  if (mode === 'single' || mode === 'fixedCount') {
    if (games.length < requiredGames) return { seriesComplete: false, winnerEntryId: null };
    if (scoreA === scoreB) return { seriesComplete: true, winnerEntryId: null };
    return { seriesComplete: true, winnerEntryId: scoreA > scoreB ? player1EntryId : player2EntryId };
  }

  // raceToMargin: deliberately uncapped — no maximum-games safety limit,
  // continues for as long as it takes to satisfy the margin (planning.md
  // decision 1, instruction.md B50 "Đừng làm"). Do not add one here.
  const leader = Math.max(scoreA, scoreB);
  const margin = Math.abs(scoreA - scoreB);
  if (leader >= ruleSet.seriesTargetScore && margin >= ruleSet.seriesMargin) {
    return { seriesComplete: true, winnerEntryId: scoreA > scoreB ? player1EntryId : player2EntryId };
  }
  return { seriesComplete: false, winnerEntryId: null };
}

module.exports = { VALID_SERIES_MODES, computeSeriesScore, evaluateSeries };
