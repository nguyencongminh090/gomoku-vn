'use strict';

/**
 * ChallengeSeries — best-of-N friend-challenge series state (#222). Pure: no IO.
 *
 * Lives on `room.series` for the room a challenge seats. One room plays the whole
 * series; colours already alternate per game (GameHandler.startGame). Per-game
 * Elo is skipped while a series runs — `finish()` hands every game to ONE rating
 * period (RatingService.recordSeries), plus the optional Swap Elo stake.
 *
 * Ends when: one side can no longer be caught (wins > total/2, or the lead exceeds
 * the games left), all N games are played, or a series player leaves / is replaced
 * (abandon → result from the games played; tie → no swap, decided 2026-10-12).
 */

/**
 * @param {{players:[string,string], total:number, stake:'none'|'swap', rated:boolean, category:string|null}} o
 */
function create({ players, total, stake, rated, category }) {
  return {
    players: [...players], total, stake, rated: !!rated, category,
    games: [], done: false, winnerId: null, reason: null,
  };
}

function wins(series, userId) {
  return series.games.filter((g) => g.winner === userId).length;
}

/** Both engine players are exactly the series pair (seat order irrelevant). */
function isSeriesPair(series, ids) {
  return ids.length === 2 && series.players.every((p) => ids.includes(p)) && ids[0] !== ids[1];
}

/** Record a finished game. `winner` = player id | 'draw'. */
function addGame(series, gameId, winner) {
  series.games.push({ gameId, winner });
}

function isDecided(series) {
  const [a, b] = series.players.map((p) => wins(series, p));
  const left = series.total - series.games.length;
  return left <= 0 || Math.abs(a - b) > left;
}

/**
 * Close the series. Returns the rating job when it must be rated, else null.
 * @param {'complete'|'abandoned'} reason
 */
function finish(series, reason, { cooldownMs = 0 } = {}) {
  if (series.done) return null;
  series.done = true;
  series.reason = reason;
  const [a, b] = series.players.map((p) => wins(series, p));
  series.winnerId = a === b ? null : a > b ? series.players[0] : series.players[1];
  const played = series.games.filter((g) => g.winner);
  if (!series.rated || !series.category || played.length === 0) return null;
  return {
    gameIds: played.map((g) => g.gameId),
    category: series.category,
    players: series.players.map((id) => ({ id })),
    winners: played.map((g) => g.winner),
    stake: series.stake === 'swap' ? 'swap' : null,
    cooldownMs,
  };
}

/** Client view (room payloads, series:end). */
function view(series) {
  if (!series) return null;
  const score = {};
  for (const p of series.players) score[p] = wins(series, p);
  return {
    total: series.total, stake: series.stake, rated: series.rated, played: series.games.length,
    score, draws: series.games.filter((g) => g.winner === 'draw').length,
    done: series.done, winnerId: series.winnerId, reason: series.reason,
  };
}

module.exports = { create, addGame, isDecided, isSeriesPair, finish, view, wins };
