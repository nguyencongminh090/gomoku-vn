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
 * Should this finished game be rated?
 * @param {{ranked:boolean, winningRule:string, players:Array<{id,isGuest}>, result:object|null}} game
 */
function isRatedGame(game) {
  if (!game || game.ranked !== true || !game.result) return false;
  if (!categoryFor(game.winningRule)) return false;
  const ps = game.players || [];
  if (ps.length !== 2) return false;
  if (ps.some((p) => !p || !p.id || p.isGuest)) return false;
  if (ps[0].id === ps[1].id) return false;
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
      results = db.transaction(() => batch.map(({ job }) => rateGame(db, job)))();
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

module.exports = {
  CATEGORIES,
  INITIAL_RATING,
  INITIAL_RD,
  INITIAL_VOL,
  PROVISIONAL_RD,
  glicko2,
  categoryFor,
  isRatedGame,
  rateGame,
  createRatingQueue,
  recordGame,
};
