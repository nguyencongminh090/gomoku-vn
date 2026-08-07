'use strict';

/**
 * TournamentMatchHandler.test.js — Unit tests for the tournament match
 * gameplay socket domain (Phase 4, TODO.md #48 / instruction.md B48).
 *
 * Strategy: TournamentManager is mocked (this suite isn't re-testing
 * PairingLifecycle/round-advancement — TournamentManager.test.js and
 * PairingLifecycle.test.js already do that), but GameEngine and
 * tournamentState are REAL — driving actual moves through a real engine is
 * what actually exercises startMatch's color/timer-slot wiring and
 * _endMatch's winner->entryId translation, which a mocked engine couldn't
 * catch a mismatch in.
 */

jest.useFakeTimers();

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const mockTournamentManager = {
  getTournament: jest.fn(),
  getPairing: jest.fn(),
  recordPairingResult: jest.fn(),
};
jest.mock('../managers/tournament/TournamentManager', () => mockTournamentManager);

const mockFindSocketsByUserId = jest.fn(() => []);
jest.mock('../socket/state', () => ({ findSocketsByUserId: mockFindSocketsByUserId }));

const mockChatManager = { handleMessage: jest.fn() };
jest.mock('../managers/ChatHandler', () => mockChatManager);

const TournamentMatchHandler = require('../socket/handlers/TournamentMatchHandler');
const tournamentState = require('../socket/tournamentState');
const config = require('../config');

// ── Mock io/socket helpers ──────────────────────────────────────────────────

let socketSeq = 0;

function makeIo() {
  const roomAdapter = new Map(); // room -> Set<socketId>, mirrors io.sockets.adapter.rooms
  const socketRegistry = new Map(); // socketId -> socket, mirrors io.sockets.sockets
  const io = {
    _toEmitted: {},
    to: jest.fn(function (room) {
      return {
        emit: jest.fn((event, data) => {
          if (!io._toEmitted[room]) io._toEmitted[room] = [];
          io._toEmitted[room].push({ event, data });
        }),
      };
    }),
    in: jest.fn(function () { return { socketsLeave: jest.fn() }; }),
    sockets: { adapter: { rooms: roomAdapter }, sockets: socketRegistry },
  };
  return io;
}

/**
 * Registers the socket into `io`'s room adapter as a real connection would,
 * so `_getSpectators`' room-membership read (TODO.md #50) sees it — plain
 * `fire()` calls bypass Socket.io's real room/broadcast machinery entirely,
 * so without this a mock socket's `.join()` would never show up anywhere.
 */
function makeSocket(io, userId, displayName) {
  socketSeq++;
  const id = `sock-${socketSeq}`;
  const handlers = {};
  const socket = {
    id,
    user: { userId, displayName, isGuest: false },
    rooms: new Set(),
    _emitted: [],
    join: jest.fn(function (room) {
      this.rooms.add(room);
      if (!io.sockets.adapter.rooms.has(room)) io.sockets.adapter.rooms.set(room, new Set());
      io.sockets.adapter.rooms.get(room).add(id);
    }),
    emit: jest.fn(function (event, data) { this._emitted.push({ event, data }); }),
    on: jest.fn((event, fn) => { handlers[event] = fn; }),
  };
  socket._handlers = handlers;
  io.sockets.sockets.set(id, socket);
  return socket;
}

function fire(socket, event, payload) {
  return socket._handlers[event](payload || {});
}

function sockEmit(socket, event) {
  return [...socket._emitted].reverse().find((e) => e.event === event);
}

function fakeTimer() {
  return {
    onTimeout: null,
    getTimers: jest.fn(() => ({ black: 300, white: 300 })),
    getSync: jest.fn(() => ({ deadline: Date.now() + 300_000 })),
    switchTurn: jest.fn(),
    addTime: jest.fn(),
    start: jest.fn(),
    destroy: jest.fn(),
  };
}

/** Basic 8x8 freestyle ruleSet, no walls/portals/swap2. */
function ruleSet(overrides = {}) {
  return {
    boardSize: 8, winningRule: 'freestyle',
    ruleWall: false, rulePortal: false, ruleSwap2: false,
    timerMode: 'per_game', timerSeconds: 300, timerIncrementSeconds: 0,
    seriesMode: 'single', seriesGameCount: null, seriesTargetScore: null, seriesMargin: null,
    ...overrides,
  };
}

function setupTournamentAndPairing({ boardSize = 8, ruleSwap2 = false } = {}) {
  const entry1 = { entryId: 'e1', userId: 'u1', displayName: 'Player One', isGuest: false };
  const entry2 = { entryId: 'e2', userId: 'u2', displayName: 'Player Two', isGuest: false };
  const tournament = {
    tournamentId: 't1',
    ruleSet: ruleSet({ boardSize, ruleSwap2 }),
    entries: new Map([[entry1.entryId, entry1], [entry2.entryId, entry2]]),
  };
  const pairing = {
    pairingId: 'p1', player1EntryId: entry1.entryId, player2EntryId: entry2.entryId, state: 'InProgress',
    games: [], seriesScore: null,
  };

  mockTournamentManager.getTournament.mockReturnValue(tournament);
  mockTournamentManager.getPairing.mockReturnValue(pairing);

  return { tournament, pairing, entry1, entry2 };
}

beforeEach(() => {
  jest.clearAllMocks();
  tournamentState.tournamentGameMap.clear();
  tournamentState.tournamentTimerMap.clear();
  // Default: pairing completes outright (seriesComplete key absent, same as
  // TournamentManager.recordPairingResult's real 'single'-mode return
  // shape) — individual tests override this via mockReturnValueOnce for
  // series-in-progress scenarios.
  mockTournamentManager.recordPairingResult.mockReturnValue({ pairing: {}, tournament: {} });
});

// ---------------------------------------------------------------------------
// startMatch
// ---------------------------------------------------------------------------

describe('TournamentMatchHandler — startMatch', () => {
  test('creates a GameEngine with player1=BLACK/player2=WHITE (matching the timer\'s black/white slot convention) and emits tmatch:init', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    const timer = fakeTimer();
    tournamentState.tournamentTimerMap.set('p1', timer);
    const io = makeIo();

    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const match = tournamentState.tournamentGameMap.get('p1');
    expect(match).toBeDefined();
    expect(match.engine.players[0]).toMatchObject({ userId: entry1.userId, color: 'BLACK' });
    expect(match.engine.players[1]).toMatchObject({ userId: entry2.userId, color: 'WHITE' });
    expect(match.entryByUserId.get(entry1.userId)).toBe(entry1.entryId);
    expect(match.userIdByEntry.get(entry2.entryId)).toBe(entry2.userId);

    expect(typeof timer.onTimeout).toBe('function');
    const emitted = io._toEmitted['tournament-match:p1'];
    expect(emitted).toContainEqual(expect.objectContaining({ event: 'tmatch:init' }));
  });

  test('no-ops when the pairing is not InProgress (e.g. still Negotiating)', () => {
    const { pairing } = setupTournamentAndPairing();
    pairing.state = 'Negotiating';
    const io = makeIo();

    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    expect(tournamentState.tournamentGameMap.has('p1')).toBe(false);
  });

  test('no-ops when the tournament or pairing has since vanished', () => {
    mockTournamentManager.getTournament.mockReturnValue(null);
    mockTournamentManager.getPairing.mockReturnValue(null);
    const io = makeIo();

    expect(() => TournamentMatchHandler.startMatch(io, 't1', 'ghost')).not.toThrow();
    expect(tournamentState.tournamentGameMap.has('ghost')).toBe(false);
  });

  // ── Series (TODO.md #50): color alternation + series info in tmatch:init ──

  test('gameIndex 0 (no games played yet): player1=BLACK/player2=WHITE, series.gameIndex=0', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    const io = makeIo();

    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const match = tournamentState.tournamentGameMap.get('p1');
    expect(match.engine.players[0]).toMatchObject({ userId: entry1.userId, color: 'BLACK' });
    expect(match.engine.players[1]).toMatchObject({ userId: entry2.userId, color: 'WHITE' });

    const init = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:init');
    expect(init.data.series).toMatchObject({ gameIndex: 0, seriesMode: 'single', scores: null });
  });

  test('gameIndex 1 (one game already played): colors flip to player1=WHITE/player2=BLACK', () => {
    const { pairing, entry1, entry2 } = setupTournamentAndPairing();
    pairing.games = [{ index: 0, winnerEntryId: entry1.entryId, endedAt: new Date().toISOString() }];
    pairing.seriesScore = { [entry1.entryId]: 1, [entry2.entryId]: 0 };
    const io = makeIo();

    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const match = tournamentState.tournamentGameMap.get('p1');
    // Stone color alternates (planning.md decision 4)...
    expect(match.engine.players[0]).toMatchObject({ userId: entry2.userId, color: 'BLACK' });
    expect(match.engine.players[1]).toMatchObject({ userId: entry1.userId, color: 'WHITE' });
    // ...but the TimerManager slot / entryByUserId mapping stays FIXED to
    // player1/player2 regardless of which stone color they hold this game.
    expect(match.entryByUserId.get(entry1.userId)).toBe(entry1.entryId);
    expect(match.entryByUserId.get(entry2.userId)).toBe(entry2.entryId);

    const init = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:init');
    expect(init.data.series).toMatchObject({
      gameIndex: 1,
      scores: [
        { displayName: entry1.displayName, score: 1 },
        { displayName: entry2.displayName, score: 0 },
      ],
    });
  });

  test('gameIndex 2 (two games played): colors flip back to game-0 assignment', () => {
    const { entry1, entry2, pairing } = setupTournamentAndPairing();
    pairing.games = [
      { index: 0, winnerEntryId: entry1.entryId, endedAt: new Date().toISOString() },
      { index: 1, winnerEntryId: entry2.entryId, endedAt: new Date().toISOString() },
    ];
    const io = makeIo();

    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const match = tournamentState.tournamentGameMap.get('p1');
    expect(match.engine.players[0]).toMatchObject({ userId: entry1.userId, color: 'BLACK' });
    expect(match.engine.players[1]).toMatchObject({ userId: entry2.userId, color: 'WHITE' });
  });

  test('ruleSwap2 pairing: seats still alternate (both colors null, Swap2 decides for real)', () => {
    const { entry1, entry2, pairing } = setupTournamentAndPairing({ ruleSwap2: true });
    pairing.games = [{ index: 0, winnerEntryId: entry1.entryId, endedAt: new Date().toISOString() }];
    const io = makeIo();

    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const match = tournamentState.tournamentGameMap.get('p1');
    expect(match.engine.players[0]).toMatchObject({ userId: entry2.userId, color: null });
    expect(match.engine.players[1]).toMatchObject({ userId: entry1.userId, color: null });
  });
});

// ---------------------------------------------------------------------------
// tmatch:subscribe — direct page navigation / spectator join
// ---------------------------------------------------------------------------

describe('TournamentMatchHandler — tmatch:subscribe', () => {
  test('a participant navigating straight to the match URL gets tmatch:init and joins the room', () => {
    const { entry1 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);

    fire(p1socket, 'tmatch:subscribe', { tournamentId: 't1', pairingId: 'p1' });

    expect(p1socket.join).toHaveBeenCalledWith('tournament-match:p1');
    expect(sockEmit(p1socket, 'tmatch:init')).toBeDefined();
  });

  test('a spectator (not a participant) can also subscribe — unlike tmatch:move/resign, watching is not restricted to the two players', () => {
    setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const spectator = makeSocket(io, 'spectator1', 'Spectator');
    TournamentMatchHandler.register(io, spectator);

    fire(spectator, 'tmatch:subscribe', { tournamentId: 't1', pairingId: 'p1' });

    expect(spectator.join).toHaveBeenCalledWith('tournament-match:p1');
    expect(sockEmit(spectator, 'tmatch:init')).toBeDefined();
    expect(sockEmit(spectator, 'tmatch:error')).toBeUndefined();
  });

  test('subscribing to a pairing with no live match (never started, or already ended) is rejected', () => {
    setupTournamentAndPairing();
    const io = makeIo();
    // Deliberately never call startMatch() — tournamentGameMap stays empty.

    const socket = makeSocket(io, 'u1', 'Player One');
    TournamentMatchHandler.register(io, socket);

    fire(socket, 'tmatch:subscribe', { tournamentId: 't1', pairingId: 'p1' });

    expect(sockEmit(socket, 'tmatch:error').data.code).toBe('NO_ACTIVE_MATCH');
    expect(socket.join).not.toHaveBeenCalled();
  });

  test('subscribing with a mismatched tournamentId is rejected the same way', () => {
    const { entry1 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, socket);

    fire(socket, 'tmatch:subscribe', { tournamentId: 'wrong-tournament', pairingId: 'p1' });

    expect(sockEmit(socket, 'tmatch:error').data.code).toBe('NO_ACTIVE_MATCH');
  });
});

// ---------------------------------------------------------------------------
// tmatch:move — gameplay decision table: wrong turn / non-participant / win / draw
// ---------------------------------------------------------------------------

describe('TournamentMatchHandler — tmatch:move', () => {
  test('a non-participant is rejected with NO_ACTIVE_MATCH', () => {
    setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const outsider = makeSocket(io, 'spectator1', 'Spectator');
    TournamentMatchHandler.register(io, outsider);

    fire(outsider, 'tmatch:move', { tournamentId: 't1', pairingId: 'p1', x: 0, y: 0 });

    expect(sockEmit(outsider, 'tmatch:error').data.code).toBe('NO_ACTIVE_MATCH');
  });

  test('moving out of turn is rejected by the engine and forwarded as tmatch:error', () => {
    const { entry2 } = setupTournamentAndPairing(); // player1=black moves first
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const p2socket = makeSocket(io, entry2.userId, 'Player Two');
    TournamentMatchHandler.register(io, p2socket);

    fire(p2socket, 'tmatch:move', { tournamentId: 't1', pairingId: 'p1', x: 0, y: 0 });

    expect(sockEmit(p2socket, 'tmatch:error').data.code).toBe('NOT_YOUR_TURN');
  });

  test('five in a row ends the match, broadcasts tmatch:ended, and records the winning entryId', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    const p2socket = makeSocket(io, entry2.userId, 'Player Two');
    TournamentMatchHandler.register(io, p1socket);
    TournamentMatchHandler.register(io, p2socket);

    const move = (socket, x, y) => fire(socket, 'tmatch:move', { tournamentId: 't1', pairingId: 'p1', x, y });

    // Black (entry1) builds a horizontal five; White (entry2) plays elsewhere.
    move(p1socket, 0, 0); move(p2socket, 0, 1);
    move(p1socket, 1, 0); move(p2socket, 1, 1);
    move(p1socket, 2, 0); move(p2socket, 2, 1);
    move(p1socket, 3, 0); move(p2socket, 3, 1);
    move(p1socket, 4, 0); // five in a row for entry1

    const ended = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:ended');
    expect(ended.data.result.winner).toBe(entry1.userId);
    expect(mockTournamentManager.recordPairingResult).toHaveBeenCalledWith('t1', 'p1', entry1.entryId);
    expect(tournamentState.tournamentGameMap.has('p1')).toBe(false);
  });

  test('resigning ends the match in favor of the opponent', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);

    fire(p1socket, 'tmatch:resign', { tournamentId: 't1', pairingId: 'p1' });

    expect(mockTournamentManager.recordPairingResult).toHaveBeenCalledWith('t1', 'p1', entry2.entryId);
    expect(tournamentState.tournamentGameMap.has('p1')).toBe(false);
  });

  test('a fully-filled board with no line ends the match as a draw', () => {
    // 4x4 board: physically impossible to form 5-in-a-row, so filling every
    // cell is guaranteed to hit the board-full draw branch deterministically.
    const { entry1, entry2 } = setupTournamentAndPairing({ boardSize: 4 });
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    const p2socket = makeSocket(io, entry2.userId, 'Player Two');
    TournamentMatchHandler.register(io, p1socket);
    TournamentMatchHandler.register(io, p2socket);

    const cells = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) cells.push([x, y]);

    let turn = p1socket;
    for (const [x, y] of cells) {
      const before = tournamentState.tournamentGameMap.get('p1');
      if (!before) break; // match already ended
      fire(turn, 'tmatch:move', { tournamentId: 't1', pairingId: 'p1', x, y });
      turn = turn === p1socket ? p2socket : p1socket;
    }

    const ended = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:ended');
    expect(ended.data.result.winner).toBe('draw');
    expect(mockTournamentManager.recordPairingResult).toHaveBeenCalledWith('t1', 'p1', 'draw');
  });
});

// ---------------------------------------------------------------------------
// _endMatch series transition (TODO.md #50) — via tmatch:resign, the
// simplest single-move path to a game-ending result.
// ---------------------------------------------------------------------------

describe('TournamentMatchHandler — series transition (_endMatch)', () => {
  test('series NOT complete: tmatch:ended carries seriesComplete=false + running score, and the match room stays joined', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1'); // consumes the default pairing mock

    // Now arrange the two getPairing() calls _endMatch itself makes: one for
    // `pairing.moves = ...`, one (after recordPairingResult) for the
    // now-updated running score.
    mockTournamentManager.recordPairingResult.mockReturnValueOnce({
      tournament: {}, pairing: {}, seriesComplete: false,
    });
    mockTournamentManager.getPairing
      .mockReturnValueOnce({
        pairingId: 'p1', player1EntryId: entry1.entryId, player2EntryId: entry2.entryId, state: 'InProgress',
        games: [], seriesScore: null,
      })
      .mockReturnValueOnce({
        pairingId: 'p1', player1EntryId: entry1.entryId, player2EntryId: entry2.entryId, state: 'Ready',
        games: [{ index: 0, winnerEntryId: entry1.entryId }],
        seriesScore: { [entry1.entryId]: 1, [entry2.entryId]: 0 },
      });

    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);
    fire(p1socket, 'tmatch:resign', { tournamentId: 't1', pairingId: 'p1' });

    const ended = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:ended');
    expect(ended.data.series).toEqual({
      seriesComplete: false,
      scores: [
        { displayName: entry1.displayName, score: 1 },
        { displayName: entry2.displayName, score: 0 },
      ],
    });
    // The GameEngine itself is torn down (a fresh one is built for the next
    // game once both players re-check-in)...
    expect(tournamentState.tournamentGameMap.has('p1')).toBe(false);
    // ...but socketsLeave is NOT called — players/spectators stay in the
    // match room to receive the next game's tmatch:init automatically.
    expect(io.in).not.toHaveBeenCalled();
  });

  test('series complete (or single-mode, or double_elim replay): the match room is torn down as before', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    // Default mock (see beforeEach) returns no seriesComplete key — same
    // shape as a real single-mode/fully-decided completion.
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);
    fire(p1socket, 'tmatch:resign', { tournamentId: 't1', pairingId: 'p1' });

    const ended = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:ended');
    expect(ended.data.series.seriesComplete).toBe(true);
    expect(io.in).toHaveBeenCalledWith('tournament-match:p1');
  });

  test('a decided series carries the PAIRING\'s overall winner, which can differ from who won this last game', () => {
    // Series tied 1-1 after 2 games: entry2 won game 1, entry1 (who just
    // resigned this game) actually... construct the scenario explicitly:
    // pairing.result reflects the SERIES winner (entry2), even though THIS
    // game's engine result says entry1's opponent (entry2) is who benefits
    // from the resign — i.e. the two must be capable of disagreeing, which
    // this test asserts by pointing them at different entries.
    const { entry1, entry2 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    mockTournamentManager.recordPairingResult.mockReturnValueOnce({
      tournament: {}, pairing: {}, // seriesComplete absent -> complete
    });
    mockTournamentManager.getPairing
      .mockReturnValueOnce({
        pairingId: 'p1', player1EntryId: entry1.entryId, player2EntryId: entry2.entryId, state: 'InProgress',
        games: [], seriesScore: null,
      })
      .mockReturnValueOnce({
        pairingId: 'p1', player1EntryId: entry1.entryId, player2EntryId: entry2.entryId, state: 'Completed',
        games: [
          { index: 0, winnerEntryId: entry2.entryId },
          { index: 1, winnerEntryId: entry1.entryId },
        ],
        seriesScore: { [entry1.entryId]: 1, [entry2.entryId]: 1 },
        result: { winnerEntryId: null, reason: 'draw' }, // series tied overall
      });

    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);
    fire(p1socket, 'tmatch:resign', { tournamentId: 't1', pairingId: 'p1' }); // this GAME: entry2 wins

    const ended = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:ended');
    expect(ended.data.result.winner).toBe(entry2.userId); // this game's winner
    expect(ended.data.series.seriesIsDraw).toBe(true);     // but the SERIES tied overall
    expect(ended.data.series.seriesWinnerUserId).toBeNull();
  });

  test('a decided series with a real overall winner resolves seriesWinnerUserId to that player\'s userId', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    mockTournamentManager.recordPairingResult.mockReturnValueOnce({ tournament: {}, pairing: {} });
    mockTournamentManager.getPairing
      .mockReturnValueOnce({
        pairingId: 'p1', player1EntryId: entry1.entryId, player2EntryId: entry2.entryId, state: 'InProgress',
        games: [], seriesScore: null,
      })
      .mockReturnValueOnce({
        pairingId: 'p1', player1EntryId: entry1.entryId, player2EntryId: entry2.entryId, state: 'Completed',
        games: [{ index: 0, winnerEntryId: entry1.entryId }, { index: 1, winnerEntryId: entry1.entryId }],
        seriesScore: { [entry1.entryId]: 2, [entry2.entryId]: 0 },
        result: { winnerEntryId: entry1.entryId, reason: 'series_decided' },
      });

    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);
    fire(p1socket, 'tmatch:resign', { tournamentId: 't1', pairingId: 'p1' });

    const ended = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:ended');
    expect(ended.data.series.seriesWinnerUserId).toBe(entry1.userId);
    expect(ended.data.series.seriesIsDraw).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Timeout — TimerManager.onTimeout wiring set up by startMatch
// ---------------------------------------------------------------------------

describe('TournamentMatchHandler — timeout', () => {
  test('a clock timeout ends the match in favor of the other entry', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    const timer = fakeTimer();
    tournamentState.tournamentTimerMap.set('p1', timer);
    const io = makeIo();

    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    timer.onTimeout(entry1.entryId); // entry1 (black) times out

    expect(mockTournamentManager.recordPairingResult).toHaveBeenCalledWith('t1', 'p1', entry2.entryId);
    const ended = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:ended');
    expect(ended.data.result.reason).toBe('timeout');
    expect(tournamentState.tournamentGameMap.has('p1')).toBe(false);
  });

  test('a timeout for an entryId no longer in the match is a safe no-op', () => {
    setupTournamentAndPairing();
    const timer = fakeTimer();
    tournamentState.tournamentTimerMap.set('p1', timer);
    const io = makeIo();

    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    expect(() => timer.onTimeout('unknown-entry')).not.toThrow();
    expect(mockTournamentManager.recordPairingResult).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resyncOnConnect
// ---------------------------------------------------------------------------

describe('TournamentMatchHandler — resyncOnConnect', () => {
  test('a participant reconnecting mid-match rejoins the match room and gets tmatch:init', () => {
    const { entry1 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const reconnecting = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.resyncOnConnect(io, reconnecting);

    expect(reconnecting.join).toHaveBeenCalledWith('tournament-match:p1');
    expect(sockEmit(reconnecting, 'tmatch:init')).toBeDefined();
  });

  test('a user with no live match is left untouched', () => {
    setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const bystander = makeSocket(io, 'someone-else', 'Bystander');
    TournamentMatchHandler.resyncOnConnect(io, bystander);

    expect(bystander.join).not.toHaveBeenCalled();
    expect(sockEmit(bystander, 'tmatch:init')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Chat + spectator presence (TODO.md #50 step 7 — "audience support")
// ---------------------------------------------------------------------------

describe('TournamentMatchHandler — tmatch:chat_message', () => {
  test('a player in the match room can chat — relayed via managers/ChatHandler, scoped to the match room', () => {
    const { entry1 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);
    fire(p1socket, 'tmatch:subscribe', { tournamentId: 't1', pairingId: 'p1' }); // joins the room

    fire(p1socket, 'tmatch:chat_message', { pairingId: 'p1', text: 'gg' });

    expect(mockChatManager.handleMessage).toHaveBeenCalledWith(io, p1socket, 'tournament-match:p1', 'gg');
  });

  test('a subscribed spectator can also chat — not restricted to the two players', () => {
    setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const spectator = makeSocket(io, 'spectator1', 'Spectator');
    TournamentMatchHandler.register(io, spectator);
    fire(spectator, 'tmatch:subscribe', { tournamentId: 't1', pairingId: 'p1' });

    fire(spectator, 'tmatch:chat_message', { pairingId: 'p1', text: 'hi all' });

    expect(mockChatManager.handleMessage).toHaveBeenCalledWith(io, spectator, 'tournament-match:p1', 'hi all');
  });

  test('a socket that never joined the match room is rejected with MUST_BE_IN_MATCH_TO_CHAT', () => {
    setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const outsider = makeSocket(io, 'outsider1', 'Outsider');
    TournamentMatchHandler.register(io, outsider); // never subscribes/joins

    fire(outsider, 'tmatch:chat_message', { pairingId: 'p1', text: 'gg' });

    expect(mockChatManager.handleMessage).not.toHaveBeenCalled();
    expect(sockEmit(outsider, 'tmatch:error').data.code).toBe('MUST_BE_IN_MATCH_TO_CHAT');
  });
});

describe('TournamentMatchHandler — tmatch:presence', () => {
  test('starting a match broadcasts presence with no spectators yet (players are excluded from the spectator list)', () => {
    setupTournamentAndPairing();
    const io = makeIo();

    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const presence = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:presence');
    expect(presence.data.spectators).toEqual([]);
  });

  test('a spectator subscribing is broadcast to everyone in the room, not just themselves', () => {
    const { entry1 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);
    fire(p1socket, 'tmatch:subscribe', { tournamentId: 't1', pairingId: 'p1' });

    const spectator = makeSocket(io, 'spectator1', 'Spectator');
    TournamentMatchHandler.register(io, spectator);
    fire(spectator, 'tmatch:subscribe', { tournamentId: 't1', pairingId: 'p1' });

    const presenceEvents = io._toEmitted['tournament-match:p1'].filter((e) => e.event === 'tmatch:presence');
    const latest = presenceEvents[presenceEvents.length - 1];
    expect(latest.data.spectators).toEqual([{ userId: 'spectator1', displayName: 'Spectator' }]);
  });

  test('the SAME spectator joining with two sockets (two tabs) is only counted once', () => {
    setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const tab1 = makeSocket(io, 'spectator1', 'Spectator');
    TournamentMatchHandler.register(io, tab1);
    fire(tab1, 'tmatch:subscribe', { tournamentId: 't1', pairingId: 'p1' });

    const tab2 = makeSocket(io, 'spectator1', 'Spectator');
    TournamentMatchHandler.register(io, tab2);
    fire(tab2, 'tmatch:subscribe', { tournamentId: 't1', pairingId: 'p1' });

    const presenceEvents = io._toEmitted['tournament-match:p1'].filter((e) => e.event === 'tmatch:presence');
    const latest = presenceEvents[presenceEvents.length - 1];
    expect(latest.data.spectators).toHaveLength(1);
  });

  test('a spectator disconnecting is removed from the next presence broadcast', () => {
    setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const spectator = makeSocket(io, 'spectator1', 'Spectator');
    TournamentMatchHandler.register(io, spectator);
    fire(spectator, 'tmatch:subscribe', { tournamentId: 't1', pairingId: 'p1' });

    // Simulate what Socket.io does on a real disconnect: remove the socket
    // from the room adapter, THEN fire 'disconnecting' — the handler defers
    // its own re-broadcast via setImmediate specifically so it runs after
    // this, see the doc comment on that listener.
    io.sockets.adapter.rooms.get('tournament-match:p1').delete(spectator.id);
    fire(spectator, 'disconnecting', {});
    jest.advanceTimersByTime(0); // flushes the setImmediate() the handler defers its re-broadcast onto

    const presenceEvents = io._toEmitted['tournament-match:p1'].filter((e) => e.event === 'tmatch:presence');
    const latest = presenceEvents[presenceEvents.length - 1];
    expect(latest.data.spectators).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// tmatch:draw_offer / draw_accept / draw_decline (TODO.md #57)
// ---------------------------------------------------------------------------

describe('TournamentMatchHandler — draw offer', () => {
  test('a participant offering a draw broadcasts tmatch:draw_offered + a system chat line', () => {
    const { entry1 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);

    fire(p1socket, 'tmatch:draw_offer', { tournamentId: 't1', pairingId: 'p1' });

    const offered = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:draw_offered');
    expect(offered.data).toMatchObject({ pairingId: 'p1', from: entry1.userId, fromName: 'Player One' });
    const chat = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'chat:message' && e.data.code === 'GAME_DRAW_OFFERED');
    expect(chat).toBeDefined();
  });

  test('a non-participant offering a draw is rejected with NO_ACTIVE_MATCH', () => {
    setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const outsider = makeSocket(io, 'spectator1', 'Spectator');
    TournamentMatchHandler.register(io, outsider);

    fire(outsider, 'tmatch:draw_offer', { tournamentId: 't1', pairingId: 'p1' });

    expect(sockEmit(outsider, 'tmatch:error').data.code).toBe('NO_ACTIVE_MATCH');
  });

  test('offering a draw while one is already pending is rejected by the engine', () => {
    const { entry1 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);

    fire(p1socket, 'tmatch:draw_offer', { tournamentId: 't1', pairingId: 'p1' });
    fire(p1socket, 'tmatch:draw_offer', { tournamentId: 't1', pairingId: 'p1' });

    expect(sockEmit(p1socket, 'tmatch:error').data.code).toBe('DRAW_OFFER_PENDING');
  });

  test('the opponent accepting ends the match as a draw and records it via recordPairingResult', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    const p2socket = makeSocket(io, entry2.userId, 'Player Two');
    TournamentMatchHandler.register(io, p1socket);
    TournamentMatchHandler.register(io, p2socket);

    fire(p1socket, 'tmatch:draw_offer', { tournamentId: 't1', pairingId: 'p1' });
    fire(p2socket, 'tmatch:draw_accept', { tournamentId: 't1', pairingId: 'p1' });

    const ended = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:ended');
    expect(ended.data.result.winner).toBe('draw');
    expect(mockTournamentManager.recordPairingResult).toHaveBeenCalledWith('t1', 'p1', 'draw');
    expect(tournamentState.tournamentGameMap.has('p1')).toBe(false);
  });

  test('the offering player cannot accept their own draw offer', () => {
    const { entry1 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);

    fire(p1socket, 'tmatch:draw_offer', { tournamentId: 't1', pairingId: 'p1' });
    fire(p1socket, 'tmatch:draw_accept', { tournamentId: 't1', pairingId: 'p1' });

    expect(sockEmit(p1socket, 'tmatch:error').data.code).toBe('CANNOT_SELF_ACCEPT');
    expect(tournamentState.tournamentGameMap.has('p1')).toBe(true); // match still live
  });

  test('accepting with no pending offer is rejected', () => {
    const { entry2 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p2socket = makeSocket(io, entry2.userId, 'Player Two');
    TournamentMatchHandler.register(io, p2socket);

    fire(p2socket, 'tmatch:draw_accept', { tournamentId: 't1', pairingId: 'p1' });

    expect(sockEmit(p2socket, 'tmatch:error').data.code).toBe('NO_DRAW_OFFER');
  });

  test('the opponent declining clears the offer without ending the match', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    const p2socket = makeSocket(io, entry2.userId, 'Player Two');
    TournamentMatchHandler.register(io, p1socket);
    TournamentMatchHandler.register(io, p2socket);

    fire(p1socket, 'tmatch:draw_offer', { tournamentId: 't1', pairingId: 'p1' });
    fire(p2socket, 'tmatch:draw_decline', { tournamentId: 't1', pairingId: 'p1' });

    const declined = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:draw_declined');
    expect(declined.data).toMatchObject({ pairingId: 'p1', by: entry2.userId });
    expect(tournamentState.tournamentGameMap.has('p1')).toBe(true);

    // The offer is really cleared server-side — a fresh offer now succeeds.
    fire(p1socket, 'tmatch:draw_offer', { tournamentId: 't1', pairingId: 'p1' });
    expect(sockEmit(p1socket, 'tmatch:error')).toBeUndefined();
  });

  test('declining your own draw offer is rejected', () => {
    const { entry1 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);

    fire(p1socket, 'tmatch:draw_offer', { tournamentId: 't1', pairingId: 'p1' });
    fire(p1socket, 'tmatch:draw_decline', { tournamentId: 't1', pairingId: 'p1' });

    expect(sockEmit(p1socket, 'tmatch:error').data.code).toBe('CANNOT_SELF_DECLINE');
  });
});

// ---------------------------------------------------------------------------
// tmatch:request_time / time_accept / time_decline (TODO.md #57)
// ---------------------------------------------------------------------------

describe('TournamentMatchHandler — bonus-time request', () => {
  test('a request on your own turn, within the free quota, auto-grants and adds time to the requester\'s FIXED timer slot', () => {
    const { entry1 } = setupTournamentAndPairing(); // entry1 = player1 = black turn first
    const timer = fakeTimer();
    tournamentState.tournamentTimerMap.set('p1', timer);
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);

    fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });

    expect(timer.addTime).toHaveBeenCalledWith('black', config.TIME_REQUEST_BONUS);
    const sync = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:timer_sync');
    expect(sync).toBeDefined();
    expect(io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:time_offered')).toBeUndefined();
  });

  test('requesting out of turn is rejected', () => {
    const { entry2 } = setupTournamentAndPairing(); // entry2 = white, not the first turn
    const timer = fakeTimer();
    tournamentState.tournamentTimerMap.set('p1', timer);
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p2socket = makeSocket(io, entry2.userId, 'Player Two');
    TournamentMatchHandler.register(io, p2socket);

    fire(p2socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });

    expect(sockEmit(p2socket, 'tmatch:error').data.code).toBe('TIME_REQUEST_ONLY_ON_YOUR_TURN');
    expect(timer.addTime).not.toHaveBeenCalled();
  });

  test('after using up the free quota, the next request needs the opponent\'s permission (tmatch:time_offered)', () => {
    const { entry1 } = setupTournamentAndPairing();
    const timer = fakeTimer();
    tournamentState.tournamentTimerMap.set('p1', timer);
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);

    for (let i = 0; i < config.TIME_REQUEST_FREE; i++) {
      fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });
    }
    expect(timer.addTime).toHaveBeenCalledTimes(config.TIME_REQUEST_FREE);

    fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });

    expect(timer.addTime).toHaveBeenCalledTimes(config.TIME_REQUEST_FREE); // not auto-granted this time
    const offered = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:time_offered');
    expect(offered.data).toMatchObject({ pairingId: 'p1', from: entry1.userId, bonus: config.TIME_REQUEST_BONUS });
  });

  test('a second request while one is already pending is rejected', () => {
    const { entry1 } = setupTournamentAndPairing();
    const timer = fakeTimer();
    tournamentState.tournamentTimerMap.set('p1', timer);
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);

    for (let i = 0; i < config.TIME_REQUEST_FREE; i++) {
      fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });
    }
    fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' }); // now pending
    fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' }); // rejected

    expect(sockEmit(p1socket, 'tmatch:error').data.code).toBe('TIME_REQUEST_PENDING');
  });

  test('the opponent accepting a pending request grants the bonus to the FIXED slot of the original requester', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    const timer = fakeTimer();
    tournamentState.tournamentTimerMap.set('p1', timer);
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    const p2socket = makeSocket(io, entry2.userId, 'Player Two');
    TournamentMatchHandler.register(io, p1socket);
    TournamentMatchHandler.register(io, p2socket);

    for (let i = 0; i < config.TIME_REQUEST_FREE; i++) {
      fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });
    }
    fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' }); // now pending
    timer.addTime.mockClear();

    fire(p2socket, 'tmatch:time_accept', { tournamentId: 't1', pairingId: 'p1' });

    expect(timer.addTime).toHaveBeenCalledWith('black', config.TIME_REQUEST_BONUS); // entry1 = black slot
    const granted = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:time_granted');
    expect(granted.data).toMatchObject({ pairingId: 'p1', playerId: entry1.userId, bonus: config.TIME_REQUEST_BONUS });

    // Pending is cleared — a fresh request can be made again immediately
    // (still out of free quota, so it goes straight back to pending, not an error).
    fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });
    expect(sockEmit(p1socket, 'tmatch:error')).toBeUndefined();
  });

  test('the requester cannot accept their own pending request', () => {
    const { entry1 } = setupTournamentAndPairing();
    const timer = fakeTimer();
    tournamentState.tournamentTimerMap.set('p1', timer);
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);

    for (let i = 0; i < config.TIME_REQUEST_FREE; i++) {
      fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });
    }
    fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });

    fire(p1socket, 'tmatch:time_accept', { tournamentId: 't1', pairingId: 'p1' });

    expect(sockEmit(p1socket, 'tmatch:error').data.code).toBe('CANNOT_SELF_ACCEPT');
  });

  test('accepting with no pending request is rejected', () => {
    const { entry2 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p2socket = makeSocket(io, entry2.userId, 'Player Two');
    TournamentMatchHandler.register(io, p2socket);

    fire(p2socket, 'tmatch:time_accept', { tournamentId: 't1', pairingId: 'p1' });

    expect(sockEmit(p2socket, 'tmatch:error').data.code).toBe('NO_TIME_REQUEST');
  });

  test('the opponent declining clears the pending request without granting time', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    const timer = fakeTimer();
    tournamentState.tournamentTimerMap.set('p1', timer);
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    const p2socket = makeSocket(io, entry2.userId, 'Player Two');
    TournamentMatchHandler.register(io, p1socket);
    TournamentMatchHandler.register(io, p2socket);

    for (let i = 0; i < config.TIME_REQUEST_FREE; i++) {
      fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });
    }
    fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' }); // now pending
    timer.addTime.mockClear();

    fire(p2socket, 'tmatch:time_decline', { tournamentId: 't1', pairingId: 'p1' });

    expect(timer.addTime).not.toHaveBeenCalled();
    const declined = io._toEmitted['tournament-match:p1'].find((e) => e.event === 'tmatch:time_declined');
    expect(declined.data).toMatchObject({ pairingId: 'p1', by: entry2.userId });
  });

  test('declining your own pending request is rejected', () => {
    const { entry1 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);

    for (let i = 0; i < config.TIME_REQUEST_FREE; i++) {
      fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });
    }
    fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });

    fire(p1socket, 'tmatch:time_decline', { tournamentId: 't1', pairingId: 'p1' });

    expect(sockEmit(p1socket, 'tmatch:error').data.code).toBe('CANNOT_SELF_DECLINE');
  });

  test('the free-request quota resets for the NEXT game in a series (per-game, not per-series — B57 decision)', () => {
    const { entry1 } = setupTournamentAndPairing();
    const timer1 = fakeTimer();
    tournamentState.tournamentTimerMap.set('p1', timer1);
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');
    const p1socket = makeSocket(io, entry1.userId, 'Player One');
    TournamentMatchHandler.register(io, p1socket);

    for (let i = 0; i < config.TIME_REQUEST_FREE; i++) {
      fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });
    }
    expect(timer1.addTime).toHaveBeenCalledTimes(config.TIME_REQUEST_FREE);

    // Game 1 ends (resign) and a fresh game 2 starts for the same pairing —
    // startMatch() always builds a brand-new `match` object.
    fire(p1socket, 'tmatch:resign', { tournamentId: 't1', pairingId: 'p1' });
    const timer2 = fakeTimer();
    tournamentState.tournamentTimerMap.set('p1', timer2);
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    fire(p1socket, 'tmatch:request_time', { tournamentId: 't1', pairingId: 'p1' });

    expect(timer2.addTime).toHaveBeenCalledWith('black', config.TIME_REQUEST_BONUS); // auto-granted again
  });
});
