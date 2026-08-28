'use strict';

/**
 * diag-session.js — one solo measurement game for the `/diag` page
 * (TODO.md #168 step 3).
 *
 * WHAT THIS MEASURES, AND WHY IT USES THE REAL CLASSES
 * ---------------------------------------------------
 * The number #167 is waiting on is the full client→server→client timer
 * handoff: the player moves, the server applies that move to a real
 * `TimerManager`, the opponent replies, and a fresh clock reading comes back.
 * A mock timer would measure the mock. So this builds a REAL `GameEngine` and
 * a REAL `TimerManager` per session (user_story.md R4) — the bot exists only
 * to make the clock change hands, instantly, so the handoff can be timed.
 *
 * VARIANT — plain board, deliberately
 * -----------------------------------
 * `RoomManager._validateSettings({})` — the app's own default — is walls off,
 * portals off, Swap2 off, 17x17, freestyle. That is what "default variant"
 * (planning.md OQ1) resolves to, and it is also the only setting that serves
 * R8: with walls on, a first click that is not adjacent to a wall is REFUSED
 * by the rules, and a non-technical reporter trying to measure their
 * connection would just see their stone rejected. Here every empty cell is a
 * legal move, so every click produces a measurement.
 *
 * TIMER — per_game, but not the default 60s
 * -----------------------------------------
 * Mode is hard-coded `per_game` (planning.md OQ2): it keeps one clock running
 * across the whole run, which is exactly what the handoff measurement wants.
 * The budget is NOT the app's 60s default though — a ~60s run against a 60s
 * per-game clock would time out mid-measurement and end the session before
 * enough samples were collected. DIAG_TIMER_SECONDS is sized to outlast a
 * full run comfortably.
 *
 * NOT A CLOCK AUTHORITY (R2/#167): the server owns the clock here exactly as
 * it does in a real room. Nothing the client sends adjusts it.
 */

const { GameEngine, EMPTY } = require('../managers/GameEngine');
const TimerManager = require('../managers/TimerManager');
const logger = require('../utils/logger');
const config = require('../config');

const PLAYER_ID = 'diag-player';
const BOT_ID = 'diag-bot';

/**
 * A single solo run: real engine, real timer, instant random bot.
 *
 * Lifecycle is strictly owned by the caller — `destroy()` MUST run on every
 * exit path (disconnect, timeout, game end, error). A leaked TimerManager
 * holds a 1s `setInterval` forever.
 */
class DiagSession {
  /**
   * @param {object} opts
   * @param {string} opts.sessionId       for logging
   * @param {function} [opts.onTimerSync] (sync) => void, on every clock change
   * @param {function} [opts.onTimeout]   (loserId) => void
   * @param {object}   [opts.meta]        {ip, geo} for the per-move log line
   * @param {function} [opts.random]      test seam, defaults to Math.random
   */
  constructor(opts = {}) {
    this.sessionId = opts.sessionId || 'diag';
    this.onTimerSync = opts.onTimerSync || (() => {});
    this.onTimeout = opts.onTimeout || (() => {});
    this.meta = opts.meta || {};
    this.random = opts.random || Math.random;

    this.destroyed = false;
    /** Monotonic mark for when the player's clock last started running. */
    this._turnStartNs = null;

    this.engine = new GameEngine({
      roomId: `diag:${this.sessionId}`,
      boardSize: config.DEFAULT_BOARD_SIZE,
      players: [
        { userId: PLAYER_ID, displayName: 'You', color: 'BLACK' },
        { userId: BOT_ID, displayName: 'Bot', color: 'WHITE' },
      ],
      // Plain board — see the header. No walls/portals means no
      // first-move-zone or Chebyshev-distance refusals.
      walls: [],
      portals: [],
      firstMoveZones: [],
      winningRule: 'freestyle',
      ruleSwap2: false,
    });

    this.timer = new TimerManager({
      roomId: `diag:${this.sessionId}`,
      mode: 'per_game',
      seconds: config.DIAG_TIMER_SECONDS,
      blackPlayerId: PLAYER_ID,
      whitePlayerId: BOT_ID,
      onTimeout: (loserId) => {
        // The server decided this, exactly as it would in a real room.
        this.engine.status = 'finished';
        this.engine.result = { winner: loserId === PLAYER_ID ? BOT_ID : PLAYER_ID, reason: 'timeout' };
        this.onTimeout(loserId);
      },
    });
  }

  /** Start the clock. The player (black) moves first. */
  start() {
    this.timer.start();
    this._turnStartNs = process.hrtime.bigint();
    const sync = this.timer.getSync();
    this.onTimerSync(sync);
    return sync;
  }

  /** Everything the client needs to draw the board on first paint. */
  serialize() {
    return {
      boardSize: this.engine.boardSize,
      board: this.engine.board,
      playerId: PLAYER_ID,
      botId: BOT_ID,
      playerColor: 'BLACK',
      currentTurn: this.engine.currentTurn,
      moveCount: this.engine.moveCount,
      status: this.engine.status,
      timer: this.timer.getSync(),
    };
  }

  /**
   * Every empty cell, as legal candidates for the bot.
   *
   * Legality still goes through `engine.makeMove` (planning.md OQ1) — this is
   * only the candidate list. On a plain board the two agree, but routing the
   * decision through the engine means a future variant change cannot leave a
   * hand-rolled legality check behind to drift.
   */
  _emptyCells() {
    const cells = [];
    const b = this.engine.board;
    for (let y = 0; y < b.length; y++) {
      for (let x = 0; x < b[y].length; x++) {
        if (b[y][x] === EMPTY) cells.push({ x, y });
      }
    }
    return cells;
  }

  /**
   * Bot reply: a random legal move, played immediately so the clock hands
   * back to the player without think time (R9).
   *
   * @returns {{x:number,y:number,color:string,won?:boolean,draw?:boolean}|null}
   */
  _botMove() {
    const candidates = this._emptyCells();
    // Fisher-Yates would be wasteful on a 289-cell board when we need one
    // playable pick — sample, and fall back to a scan only if the engine
    // refuses (it cannot on a plain board, but the loop is the contract).
    while (candidates.length) {
      const i = Math.floor(this.random() * candidates.length);
      const { x, y } = candidates.splice(i, 1)[0];
      const res = this.engine.makeMove(BOT_ID, x, y);
      if (!res.error) return { x, y, ...res };
    }
    return null;
  }

  /**
   * Apply the player's move, then the bot's instant reply, driving the real
   * timer at each step exactly as GameHandler does for a live room.
   *
   * @param {number} x
   * @param {number} y
   * @param {bigint} [recvNs] monotonic receipt time, for spent_ms
   * @returns {{ok:true, moves:Array, timer:object, status:string, result:object|null}
   *          | {error:string, code:string}}
   */
  playerMove(x, y, recvNs = process.hrtime.bigint()) {
    if (this.destroyed) return { error: 'Session ended.', code: 'DIAG_SESSION_GONE' };

    const res = this.engine.makeMove(PLAYER_ID, x, y);
    if (res.error) return { error: res.error, code: res.code };

    // How long the player's clock actually ran on the server for this move:
    // measured from a MONOTONIC mark, never Date.now() (same discipline as
    // move-lag.js). Includes think time plus the upload transit of the move —
    // which is the whole point: a near-zero think time makes this a floor
    // measurement of transit cost, the #167 discriminator.
    const spentMs = this._turnStartNs !== null
      ? Number(recvNs - this._turnStartNs) / 1e6
      : null;

    const moves = [{ x, y, color: 'BLACK', by: 'player' }];
    let ended = res.won || res.draw;

    if (!ended) {
      this.timer.applyMove('black', 'white');
      const bot = this._botMove();
      if (bot) {
        moves.push({ x: bot.x, y: bot.y, color: 'WHITE', by: 'bot' });
        ended = bot.won || bot.draw;
        if (!ended) this.timer.applyMove('white', 'black');
      }
    }

    if (ended) {
      this.timer.stop();
      this._turnStartNs = null;
    } else {
      // The player's clock starts again now, for the next move's spent_ms.
      this._turnStartNs = process.hrtime.bigint();
    }

    const sync = this.timer.getSync();
    this.onTimerSync(sync);

    logger.info('[DiagResult move]', {
      sid: this.sessionId,
      move: this.engine.moveCount,
      spent_ms: spentMs === null ? undefined : Math.round(spentMs * 1000) / 1000,
      black_s: sync.black,
      white_s: sync.white,
      ip: this.meta.ip,
      geo: this.meta.geo,
    });

    return {
      ok: true,
      moves,
      timer: sync,
      status: this.engine.status,
      result: this.engine.result,
      moveCount: this.engine.moveCount,
    };
  }

  /**
   * Tear down. Idempotent, because it is called from several exit paths and
   * missing one leaks a 1s interval for the life of the process.
   */
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.timer.destroy();
    this._turnStartNs = null;
  }
}

module.exports = { DiagSession, PLAYER_ID, BOT_ID };
