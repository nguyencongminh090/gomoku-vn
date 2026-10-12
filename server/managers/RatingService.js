'use strict';

/**
 * RatingService.js — Glicko-2 ratings + the game-end → rating hook (TODO.md #175).
 *
 * Decisions (features/platform/planning.md Q3/Q4, 2026-10-09):
 *   - Glicko-2, new player 1200 / RD 350 / volatility 0.06, tau 0.5;
 *     each game is its own rating period. Provisional while RD > 110.
 *   - Pool (`category`) = winning rule: freestyle | standard | caro.
 *     Wall/portal/swap2 games rate in their winning rule's pool; no speed split.
 *   - Ranked only when the room's Ranked toggle is on (default on) AND both
 *     players are members. Tournament games never reach this (they persist via
 *     saveTournamentGame, not handleGameEnd) — unrated by design.
 *
 * Writes go through an async queue flushed once per tick in ONE transaction
 * (planning.md Q8 limit 1): better-sqlite3 is synchronous and a WAL stall must
 * never run inside the game-end handler that the room clocks share.
 */

const logger = require('../utils/logger');

const CATEGORIES      = ['freestyle', 'standard', 'caro'];
const INITIAL_RATING  = 1200;
const INITIAL_RD      = 350;
const INITIAL_VOL     = 0.06;
const TAU             = 0.5;
const PROVISIONAL_RD  = 110;
const SCALE           = 173.7178;  // Glicko-2 ↔ Glicko scale factor
const CENTER          = 1500;      // Glicko-2 scale centre (independent of INITIAL_RATING)
const EPSILON         = 0.000001;

// ---------------------------------------------------------------------------
// Pure Glicko-2 (Glickman, "Example of the Glicko-2 system", 2013)
// ---------------------------------------------------------------------------

function g(phi) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

function expected(mu, muJ, phiJ) {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

/**
 * One rating period for one player.
 * @param {{rating:number, rd:number, volatility:number}} player
 * @param {Array<{rating:number, rd:number, score:number}>} results  score 1 | 0.5 | 0
 * @returns {{rating:number, rd:number, volatility:number}}
 */
function glicko2(player, results) {
  const mu  = (player.rating - CENTER) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.volatility;

  if (results.length === 0) {
    const phiStar = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: player.rating, rd: Math.min(phiStar * SCALE, INITIAL_RD), volatility: sigma };
  }

  let vInv = 0;
  let deltaSum = 0;
  for (const r of results) {
    const muJ  = (r.rating - CENTER) / SCALE;
    const phiJ = r.rd / SCALE;
    const gJ = g(phiJ);
    const E  = expected(mu, muJ, phiJ);
    vInv     += gJ * gJ * E * (1 - E);
    deltaSum += gJ * (r.score - E);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;

  // New volatility — Illinois algorithm (step 5 of the paper).
  const a = Math.log(sigma * sigma);
  const f = (x) => {
    const ex = Math.exp(x);
    const d = phi * phi + v + ex;
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * d * d) - (x - a) / (TAU * TAU);
  };
  let A = a;
  let B;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else { fA /= 2; }
    B = C; fB = fC;
  }
  const newSigma = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
  const newPhi  = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu   = mu + newPhi * newPhi * deltaSum;

  return {
    rating: newMu * SCALE + CENTER,
    rd: Math.min(newPhi * SCALE, INITIAL_RD),
    volatility: newSigma,
  };
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/** Rating pool for a game's winning rule, or null if it isn't a rated rule. */
function categoryFor(winningRule) {
  return CATEGORIES.includes(winningRule) ? winningRule : null;
}

/**
 * Will this game count for rating once it ends? Same rules as isRatedGame minus
 * the result: a ranked room, a rated rule and two distinct members. False is what
 * the room UI calls "Giao hữu" (friendly), where undo and extra time are allowed (#216).
 * @param {{ranked:boolean, winningRule:string, players:Array<{id,isGuest}>}} game
 */
function isRatedSetup(game) {
  if (!game || game.ranked !== true) return false;
  if (!categoryFor(game.winningRule)) return false;
  const ps = game.players || [];
  if (ps.length !== 2) return false;
  if (ps.some((p) => !p || !p.id || p.isGuest)) return false;
  return ps[0].id !== ps[1].id;
}

/**
 * Should this finished game be rated?
 * @param {{ranked:boolean, winningRule:string, players:Array<{id,isGuest}>, result:object|null}} game
 */
function isRatedGame(game) {
  if (!isRatedSetup(game) || !game.result) return false;
  const ps = game.players;
  const w = game.result.winner;
  return w === 'draw' || w === ps[0].id || w === ps[1].id;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function isProvisional(rd) {
  return rd > PROVISIONAL_RD;
}

/**
 * Rate one game inside the caller's transaction.
 * @param {import('better-sqlite3').Database} db
 * @param {{gameId, category, players:[{id},{id}], winner:string}} job  winner = player id | 'draw'
 * @returns {{gameId, category, players: Array}} per-player deltas
 */
function rateGame(db, job) {
  const now = new Date().toISOString();
  const read = db.prepare('SELECT rating, rd, volatility, games FROM ratings WHERE user_id = ? AND category = ?');
  const upsert = db.prepare(`
    INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, category) DO UPDATE SET
      rating = excluded.rating, rd = excluded.rd, volatility = excluded.volatility,
      games = excluded.games, updated_at = excluded.updated_at
  `);
  const history = db.prepare(`
    INSERT INTO rating_history
      (user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const [p1, p2] = job.players;
  const before = [p1, p2].map((p) => read.get(p.id, job.category)
    || { rating: INITIAL_RATING, rd: INITIAL_RD, volatility: INITIAL_VOL, games: 0 });
  const scoreOf = (p) => (job.winner === 'draw' ? 0.5 : job.winner === p.id ? 1 : 0);

  // Both updates use the PRE-game opponent values (simultaneous update).
  const after = [
    glicko2(before[0], [{ rating: before[1].rating, rd: before[1].rd, score: scoreOf(p1) }]),
    glicko2(before[1], [{ rating: before[0].rating, rd: before[0].rd, score: scoreOf(p2) }]),
  ];

  const out = [];
  [p1, p2].forEach((p, i) => {
    const opp = i === 0 ? p2 : p1;
    const b = before[i];
    const a = after[i];
    upsert.run(p.id, job.category, a.rating, a.rd, a.volatility, b.games + 1, now);
    history.run(p.id, job.category, job.gameId, opp.id, scoreOf(p), b.rating, a.rating, b.rd, a.rd, now);
    out.push({
      userId: p.id,
      before: Math.round(b.rating),
      after: Math.round(a.rating),
      delta: Math.round(a.rating) - Math.round(b.rating),
      rd: Math.round(a.rd),
      provisional: isProvisional(a.rd),
    });
  });
  return { gameId: job.gameId, category: job.category, players: out };
}

/** Winner of a series by games won: player id, or null on a tie / no games. */
function seriesWinner(players, winners) {
  const wins = players.map((p) => winners.filter((w) => w === p.id).length);
  if (wins[0] === wins[1]) return null;
  return wins[0] > wins[1] ? players[0].id : players[1].id;
}

/**
 * Rate a friend-challenge series (#222) inside the caller's transaction: all of
 * its games form ONE Glicko-2 rating period (Elo moves once, at series end), then
 * the optional Swap Elo stake. The stake exchanges the two post-series ratings of
 * this category only, and only when the series winner is the lower-rated one
 * (a swap that lowers the winner is no stake). Tie → no swap. A pair swapped in
 * the last SWAP_COOLDOWN_MS is re-checked here, so a race can't swap twice.
 * @param {import('better-sqlite3').Database} db
 * @param {{gameIds:string[], category, players:[{id},{id}], winners:string[], stake:'swap'|null, cooldownMs?:number}} job
 *   winners[i] = player id | 'draw' for game i
 * @returns {{gameId, category, players: Array, series: true, winnerId: string|null, swap: object|null}}
 */
function rateSeries(db, job) {
  const now = new Date().toISOString();
  const read = db.prepare('SELECT rating, rd, volatility, games FROM ratings WHERE user_id = ? AND category = ?');
  const upsert = db.prepare(`
    INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, category) DO UPDATE SET
      rating = excluded.rating, rd = excluded.rd, volatility = excluded.volatility,
      games = excluded.games, updated_at = excluded.updated_at
  `);
  const history = db.prepare(`
    INSERT INTO rating_history
      (user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const [p1, p2] = job.players;
  const lastGameId = job.gameIds[job.gameIds.length - 1];
  const n = job.winners.length;
  const scoreOf = (p, w) => (w === 'draw' ? 0.5 : w === p.id ? 1 : 0);
  const total = (p) => job.winners.reduce((s, w) => s + scoreOf(p, w), 0);
  const before = [p1, p2].map((p) => read.get(p.id, job.category)
    || { rating: INITIAL_RATING, rd: INITIAL_RD, volatility: INITIAL_VOL, games: 0 });
  const after = [
    glicko2(before[0], job.winners.map((w) => ({ rating: before[1].rating, rd: before[1].rd, score: scoreOf(p1, w) }))),
    glicko2(before[1], job.winners.map((w) => ({ rating: before[0].rating, rd: before[0].rd, score: scoreOf(p2, w) }))),
  ];

  const out = [];
  [p1, p2].forEach((p, i) => {
    const opp = i === 0 ? p2 : p1;
    const b = before[i];
    const a = after[i];
    upsert.run(p.id, job.category, a.rating, a.rd, a.volatility, b.games + n, now);
    // One history row per series; score = the series' average score.
    history.run(p.id, job.category, lastGameId, opp.id, total(p) / n, b.rating, a.rating, b.rd, a.rd, now);
    out.push({
      userId: p.id,
      before: Math.round(b.rating),
      after: Math.round(a.rating),
      delta: Math.round(a.rating) - Math.round(b.rating),
      rd: Math.round(a.rd),
      provisional: isProvisional(a.rd),
    });
  });

  const winnerId = seriesWinner(job.players, job.winners);
  let swap = null;
  if (job.stake === 'swap' && winnerId) {
    const wi = winnerId === p1.id ? 0 : 1;
    const li = 1 - wi;
    const w = after[wi];
    const l = after[li];
    const [lo, hi] = p1.id < p2.id ? [p1.id, p2.id] : [p2.id, p1.id];
    const since = new Date(Date.now() - (job.cooldownMs || 0)).toISOString();
    const recent = db.prepare('SELECT 1 FROM elo_swaps WHERE user_lo = ? AND user_hi = ? AND created_at > ? LIMIT 1').get(lo, hi, since);
    if (!recent && w.rating < l.rating) {
      const winner = job.players[wi];
      const loser = job.players[li];
      const setRating = db.prepare('UPDATE ratings SET rating = ?, updated_at = ? WHERE user_id = ? AND category = ?');
      setRating.run(l.rating, now, winner.id, job.category);
      setRating.run(w.rating, now, loser.id, job.category);
      history.run(winner.id, job.category, lastGameId, loser.id, 1, w.rating, l.rating, w.rd, w.rd, now);
      history.run(loser.id, job.category, lastGameId, winner.id, 0, l.rating, w.rating, l.rd, l.rd, now);
      db.prepare(`
        INSERT INTO elo_swaps (category, user_lo, user_hi, winner_id, loser_id, winner_before, winner_after, loser_before, loser_after, game_ids, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(job.category, lo, hi, winner.id, loser.id, w.rating, l.rating, l.rating, w.rating, JSON.stringify(job.gameIds), now);
      swap = { winnerId: winner.id, loserId: loser.id, winnerAfter: Math.round(l.rating), loserAfter: Math.round(w.rating) };
      for (const o of out) o.after = o.userId === winner.id ? swap.winnerAfter : swap.loserAfter;
      for (const o of out) o.delta = o.after - o.before;
    }
  }
  return { gameId: lastGameId, category: job.category, players: out, series: true, winnerId, swap };
}

// ---------------------------------------------------------------------------
// Async queue
// ---------------------------------------------------------------------------

function createRatingQueue(getDb, schedule = setImmediate) {
  let pending = [];
  let scheduled = false;

  function flush() {
    scheduled = false;
    const batch = pending;
    pending = [];
    if (batch.length === 0) return;
    const db = getDb();
    let results;
    try {
      results = db.transaction(() => batch.map(({ job }) => (job.series ? rateSeries(db, job) : rateGame(db, job))))();
    } catch (err) {
      logger.error(`[Rating] Batch of ${batch.length} failed, nothing written:`, err.message);
      return;
    }
    batch.forEach(({ onDone }, i) => {
      if (!onDone) return;
      try { onDone(results[i]); } catch (err) {
        logger.warn('[Rating] onDone callback failed:', err.message);
      }
    });
  }

  return {
    /** Queue a rating job; `onDone(deltas)` runs after the batch commits. */
    enqueue(job, onDone) {
      pending.push({ job, onDone });
      if (!scheduled) { scheduled = true; schedule(flush); }
    },
    flush,
    get size() { return pending.length; },
  };
}

// Lazy: requiring database.js opens the SQLite file.
const defaultQueue = createRatingQueue(() => require('../db/database').db);

/**
 * Game-end hook. No-op (returns false) for casual, guest, unrated-rule or
 * resultless games; otherwise queues the rating update and returns true.
 * @param {{gameId, ranked, winningRule, players:Array<{id,isGuest}>, result:{winner}}} game
 * @param {(deltas:object) => void} [onDone]
 */
function recordGame(game, onDone, queue = defaultQueue) {
  if (!isRatedGame(game)) return false;
  queue.enqueue({
    gameId: game.gameId,
    category: categoryFor(game.winningRule),
    players: game.players.map((p) => ({ id: p.id })),
    winner: game.result.winner,
  }, onDone);
  return true;
}

/**
 * Series-end hook (#222): queue one rating period for a finished challenge series.
 * Caller decides it's rated (ranked room, rated rule, two members) and passes only
 * games with a result.
 * @param {{gameIds:string[], category, players:[{id},{id}], winners:string[], stake:'swap'|null, cooldownMs:number}} job
 */
function recordSeries(job, onDone, queue = defaultQueue) {
  if (!job.gameIds.length) return false;
  queue.enqueue({ ...job, series: true }, onDone);
  return true;
}

module.exports = {
  CATEGORIES,
  INITIAL_RATING,
  INITIAL_RD,
  INITIAL_VOL,
  PROVISIONAL_RD,
  glicko2,
  categoryFor,
  isRatedSetup,
  isRatedGame,
  rateGame,
  createRatingQueue,
  recordGame,
  rateSeries,
  seriesWinner,
  recordSeries,
};
