'use strict';

/**
 * diag-session.test.js — the solo measurement board: real GameEngine, real
 * TimerManager, instant random bot (TODO.md #168 step 3).
 *
 * The point of the session is that it uses the REAL classes, so these tests
 * lean on real behaviour rather than mocks — a mocked timer would prove the
 * mock hands off, which is not the claim.
 */

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const config = require('../config');
const { DiagSession, PLAYER_ID, BOT_ID } = require('../socket/diag-session');

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

/** Sessions hold a 1s interval; every test must tear its own down. */
let live = [];
const makeSession = (opts = {}) => {
  const s = new DiagSession({ sessionId: 'test', ...opts });
  live.push(s);
  return s;
};

afterEach(() => {
  for (const s of live) s.destroy();
  live = [];
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------

describe('variant — plain board so every click is a measurement (R8)', () => {
  test('no walls, no portals, no Swap2', () => {
    const s = makeSession();
    expect(s.engine.walls).toEqual([]);
    expect(s.engine.portals).toEqual([]);
    expect(s.engine.firstMoveZones).toEqual([]);
    expect(s.engine.ruleSwap2).toBe(false);
    // Swap2 would block makeMove entirely during its opening phase.
    expect(s.engine.openingPhase).toBe('play');
  });

  test('the board is the app default size and starts completely empty', () => {
    const s = makeSession();
    expect(s.engine.boardSize).toBe(config.DEFAULT_BOARD_SIZE);
    const cells = s.engine.board.flat();
    expect(cells).toHaveLength(config.DEFAULT_BOARD_SIZE ** 2);
    expect(cells.every((c) => c === EMPTY)).toBe(true);
  });

  test('the very first move is accepted anywhere — no first-move-zone refusal', () => {
    // With walls on, a corner opening is refused
    // (SWAP2_FIRST_MOVE_MUST_BE_ADJACENT_WALL). A reporter measuring their
    // connection must never see that.
    const s = makeSession();
    s.start();
    expect(s.playerMove(0, 0).ok).toBe(true);
  });

  test('the player is BLACK and therefore moves first', () => {
    const s = makeSession();
    expect(s.engine.currentTurn).toBe(PLAYER_ID);
    expect(s.engine.players.find((p) => p.userId === PLAYER_ID).color).toBe('BLACK');
    expect(s.engine.players.find((p) => p.userId === BOT_ID).color).toBe('WHITE');
  });
});

describe('timer — a real TimerManager in per_game mode (OQ2)', () => {
  test('is per_game with a budget that outlasts a full run', () => {
    const s = makeSession();
    expect(s.timer.mode).toBe('per_game');
    expect(s.timer.initialSeconds).toBe(config.DIAG_TIMER_SECONDS);
    // A ~60s run must not be able to exhaust the clock mid-measurement.
    expect(config.DIAG_TIMER_SECONDS).toBeGreaterThan(60);
  });

  test('start() runs the clock and reports a usable sync', () => {
    const s = makeSession();
    const sync = s.start();
    expect(sync.running).toBe(true);
    expect(sync.activeColor).toBe('black');
    expect(sync.deadline).toBeGreaterThan(sync.serverTime);
    expect(sync.black).toBe(config.DIAG_TIMER_SECONDS);
  });

  test('per_game does NOT reset a clock on move — that is the whole point', () => {
    const s = makeSession();
    s.start();
    s.timer.black = 100; // simulate elapsed time
    s.playerMove(5, 5);
    expect(s.timer.black).toBe(100);
  });

  test('the clock hands back to the player after the bot replies', () => {
    // The measured quantity: move -> server -> bot -> clock back to me.
    const s = makeSession();
    s.start();
    const res = s.playerMove(5, 5);
    expect(res.timer.activeColor).toBe('black');
    expect(res.moves.map((m) => m.by)).toEqual(['player', 'bot']);
  });

  test('emits a timer sync on start and on every move', () => {
    const onTimerSync = jest.fn();
    const s = makeSession({ onTimerSync });
    s.start();
    expect(onTimerSync).toHaveBeenCalledTimes(1);
    s.playerMove(5, 5);
    s.playerMove(6, 6);
    expect(onTimerSync).toHaveBeenCalledTimes(3);
  });

  test('a timeout finishes the game and reports the loser', () => {
    const onTimeout = jest.fn();
    const s = makeSession({ onTimeout });
    s.start();
    s.timer.black = 1;
    s.timer._tick(); // drive the real tick rather than waiting a second

    expect(onTimeout).toHaveBeenCalledWith(PLAYER_ID);
    expect(s.engine.status).toBe('finished');
    expect(s.engine.result).toMatchObject({ winner: BOT_ID, reason: 'timeout' });
  });
});

describe('bot — random legal replies, routed through the engine (OQ1/R9)', () => {
  test('answers every player move immediately', () => {
    const s = makeSession();
    s.start();
    const res = s.playerMove(5, 5);
    const bot = res.moves[1];
    expect(bot).toMatchObject({ color: 'WHITE', by: 'bot' });
    expect(s.engine.board[bot.y][bot.x]).toBe(WHITE);
  });

  test('never plays on an occupied cell across a long game', () => {
    const s = makeSession();
    s.start();
    let placed = 0;
    for (let i = 0; i < 40 && s.engine.status === 'ongoing'; i++) {
      const spot = s._emptyCells()[0];
      const res = s.playerMove(spot.x, spot.y);
      if (!res.ok) break;
      placed += res.moves.length;
    }
    // Every stone on the board is exactly one move — no overwrite, no gap.
    const stones = s.engine.board.flat().filter((c) => c === BLACK || c === WHITE).length;
    expect(stones).toBe(placed);
    expect(s.engine.moveCount).toBe(placed);
  });

  test('its move is produced by engine.makeMove, not written directly', () => {
    // If a future variant adds rules back, legality must come from the engine
    // rather than a hand-rolled copy that silently drifts.
    const s = makeSession();
    s.start();
    const spy = jest.spyOn(s.engine, 'makeMove');
    s.playerMove(5, 5);
    const callers = spy.mock.calls.map((c) => c[0]);
    expect(callers).toEqual([PLAYER_ID, BOT_ID]);
  });

  test('picks randomly — different seeds give different replies', () => {
    const pick = (r) => {
      const s = makeSession({ random: r });
      s.start();
      const m = s.playerMove(5, 5).moves[1];
      return `${m.x},${m.y}`;
    };
    expect(pick(() => 0)).not.toBe(pick(() => 0.99));
  });

  test('retries when the engine refuses a candidate, rather than giving up', () => {
    const s = makeSession();
    s.start();
    const real = s.engine.makeMove.bind(s.engine);
    let botCalls = 0;
    jest.spyOn(s.engine, 'makeMove').mockImplementation((who, x, y) => {
      if (who === BOT_ID && botCalls++ < 3) {
        return { error: 'nope', code: 'TEST_REFUSED' };
      }
      return real(who, x, y);
    });
    const res = s.playerMove(5, 5);
    expect(botCalls).toBe(4);
    expect(res.moves).toHaveLength(2);
  });

  test('does not move after the player has already won', () => {
    const s = makeSession();
    s.start();
    // Give black four in a row, then complete it.
    for (let i = 0; i < 4; i++) s.engine.board[0][i] = BLACK;
    s.engine.currentTurn = PLAYER_ID;
    const res = s.playerMove(4, 0);
    expect(res.status).toBe('finished');
    expect(res.moves).toHaveLength(1);
    expect(res.moves[0].by).toBe('player');
  });
});

describe('playerMove — validation and the spent_ms measurement', () => {
  test('refuses an occupied cell with the engine\'s own code', () => {
    const s = makeSession();
    s.start();
    s.playerMove(5, 5);
    expect(s.playerMove(5, 5)).toMatchObject({ code: 'CELL_OCCUPIED' });
  });

  test('refuses an out-of-bounds cell', () => {
    const s = makeSession();
    s.start();
    expect(s.playerMove(-1, 0)).toMatchObject({ code: 'OUT_OF_BOUNDS' });
    expect(s.playerMove(0, 999)).toMatchObject({ code: 'OUT_OF_BOUNDS' });
  });

  test('a refused move does not advance the clock or the board', () => {
    const s = makeSession();
    s.start();
    const before = s.timer.getTimers();
    s.playerMove(5, 5);
    const afterValid = s.timer.getTimers();
    s.playerMove(5, 5); // refused
    expect(s.timer.getTimers()).toEqual(afterValid);
    expect(before).toEqual(afterValid); // per_game: no reset either way
  });

  test('logs one [DiagResult move] line per accepted move, with spent_ms', () => {
    const logger = require('../utils/logger');
    const s = makeSession({ meta: { ip: '1.2.3.4', geo: 'US' } });
    s.start();
    s.playerMove(5, 5);

    const call = logger.info.mock.calls.find((c) => c[0] === '[DiagResult move]');
    expect(call).toBeDefined();
    expect(call[1]).toMatchObject({ move: 2, ip: '1.2.3.4', geo: 'US' });
    expect(typeof call[1].spent_ms).toBe('number');
    expect(call[1].spent_ms).toBeGreaterThanOrEqual(0);
  });

  test('spent_ms is monotonic-derived, so a wall-clock jump cannot poison it', () => {
    const s = makeSession();
    s.start();
    const realNow = Date.now;
    try {
      Date.now = () => realNow() - 60_000; // clock jumps backwards mid-move
      const logger = require('../utils/logger');
      logger.info.mockClear();
      s.playerMove(5, 5);
      const call = logger.info.mock.calls.find((c) => c[0] === '[DiagResult move]');
      expect(call[1].spent_ms).toBeGreaterThanOrEqual(0);
    } finally {
      Date.now = realNow;
    }
  });

  test('measures from the turn start, so a slow player shows a larger spent_ms', () => {
    const s = makeSession();
    s.start();
    const t0 = s._turnStartNs;
    const later = t0 + 250_000_000n; // +250ms
    const logger = require('../utils/logger');
    logger.info.mockClear();
    s.playerMove(5, 5, later);
    const call = logger.info.mock.calls.find((c) => c[0] === '[DiagResult move]');
    expect(call[1].spent_ms).toBeCloseTo(250, 0);
  });

  test('spentMs is returned to the client so it reaches the JSONL, not just the log', () => {
    // OQ4 makes the JSONL the source of truth; the [DiagResult move] line is
    // explicitly the thing we do not rely on. Without this the documented
    // spentFloorMs field would always be absent.
    const s = makeSession();
    s.start();
    const res = s.playerMove(5, 5, s._turnStartNs + 120_000_000n);
    expect(res.spentMs).toBeCloseTo(120, 0);
  });

  test('the turn-start mark resets each move, so spent_ms is per-move not cumulative', () => {
    const s = makeSession();
    s.start();
    const first = s._turnStartNs;
    s.playerMove(5, 5);
    expect(s._turnStartNs).not.toBe(first);
    expect(s._turnStartNs > first).toBe(true);
  });
});

describe('lifecycle — nothing may outlive the session', () => {
  test('destroy stops the timer interval', () => {
    const s = makeSession();
    s.start();
    expect(s.timer._interval).not.toBeNull();
    s.destroy();
    expect(s.timer._interval).toBeNull();
  });

  test('destroy is idempotent — several exit paths call it', () => {
    const s = makeSession();
    s.start();
    s.destroy();
    expect(() => s.destroy()).not.toThrow();
    expect(s.destroyed).toBe(true);
  });

  test('a move after destroy is refused rather than resurrecting the clock', () => {
    const s = makeSession();
    s.start();
    s.destroy();
    expect(s.playerMove(5, 5)).toMatchObject({ code: 'DIAG_SESSION_GONE' });
    expect(s.timer._interval).toBeNull();
  });

  test('the game ending stops the clock', () => {
    const s = makeSession();
    s.start();
    for (let i = 0; i < 4; i++) s.engine.board[0][i] = BLACK;
    s.engine.currentTurn = PLAYER_ID;
    s.playerMove(4, 0);
    expect(s.timer._interval).toBeNull();
  });

  test('is registered in no global registry (isolation from the real app)', () => {
    // Structural, not by importing RoomManager/state.js: those modules start
    // their own long-lived intervals at require time, which would keep this
    // whole suite's worker alive. The claim is that this file never reaches
    // them at all, and the source is the honest place to assert that.
    const fs = require('fs');
    const path = require('path');
    const src = fs
      .readFileSync(path.join(__dirname, '..', 'socket', 'diag-session.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
    expect(src).not.toMatch(/require\([^)]*RoomManager/);
    expect(src).not.toMatch(/require\(['"]\.\/state['"]\)/);
    expect(src).not.toMatch(/timerMap/);
  });
});

describe('serialize — first paint payload', () => {
  test('carries the board, identities and a live timer sync', () => {
    const s = makeSession();
    s.start();
    const out = s.serialize();
    expect(out).toMatchObject({
      boardSize: config.DEFAULT_BOARD_SIZE,
      playerId: PLAYER_ID,
      botId: BOT_ID,
      playerColor: 'BLACK',
      currentTurn: PLAYER_ID,
      moveCount: 0,
      status: 'ongoing',
    });
    expect(out.timer.running).toBe(true);
    expect(out.board).toHaveLength(config.DEFAULT_BOARD_SIZE);
  });
});
