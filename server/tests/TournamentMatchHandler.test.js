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

const TournamentMatchHandler = require('../socket/handlers/TournamentMatchHandler');
const tournamentState = require('../socket/tournamentState');

// ── Mock io/socket helpers ──────────────────────────────────────────────────

function makeIo() {
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
  };
  return io;
}

function makeSocket(userId, displayName) {
  const handlers = {};
  const socket = {
    user: { userId, displayName, isGuest: false },
    rooms: new Set(),
    _emitted: [],
    join: jest.fn(function (room) { this.rooms.add(room); }),
    emit: jest.fn(function (event, data) { this._emitted.push({ event, data }); }),
    on: jest.fn((event, fn) => { handlers[event] = fn; }),
  };
  socket._handlers = handlers;
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
  const pairing = { pairingId: 'p1', player1EntryId: entry1.entryId, player2EntryId: entry2.entryId, state: 'InProgress' };

  mockTournamentManager.getTournament.mockReturnValue(tournament);
  mockTournamentManager.getPairing.mockReturnValue(pairing);

  return { tournament, pairing, entry1, entry2 };
}

beforeEach(() => {
  jest.clearAllMocks();
  tournamentState.tournamentGameMap.clear();
  tournamentState.tournamentTimerMap.clear();
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
});

// ---------------------------------------------------------------------------
// tmatch:move — gameplay decision table: wrong turn / non-participant / win / draw
// ---------------------------------------------------------------------------

describe('TournamentMatchHandler — tmatch:move', () => {
  test('a non-participant is rejected with NO_ACTIVE_MATCH', () => {
    setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const outsider = makeSocket('spectator1', 'Spectator');
    TournamentMatchHandler.register(io, outsider);

    fire(outsider, 'tmatch:move', { tournamentId: 't1', pairingId: 'p1', x: 0, y: 0 });

    expect(sockEmit(outsider, 'tmatch:error').data.code).toBe('NO_ACTIVE_MATCH');
  });

  test('moving out of turn is rejected by the engine and forwarded as tmatch:error', () => {
    const { entry2 } = setupTournamentAndPairing(); // player1=black moves first
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const p2socket = makeSocket(entry2.userId, 'Player Two');
    TournamentMatchHandler.register(io, p2socket);

    fire(p2socket, 'tmatch:move', { tournamentId: 't1', pairingId: 'p1', x: 0, y: 0 });

    expect(sockEmit(p2socket, 'tmatch:error').data.code).toBe('NOT_YOUR_TURN');
  });

  test('five in a row ends the match, broadcasts tmatch:ended, and records the winning entryId', () => {
    const { entry1, entry2 } = setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const p1socket = makeSocket(entry1.userId, 'Player One');
    const p2socket = makeSocket(entry2.userId, 'Player Two');
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

    const p1socket = makeSocket(entry1.userId, 'Player One');
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

    const p1socket = makeSocket(entry1.userId, 'Player One');
    const p2socket = makeSocket(entry2.userId, 'Player Two');
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

    const reconnecting = makeSocket(entry1.userId, 'Player One');
    TournamentMatchHandler.resyncOnConnect(io, reconnecting);

    expect(reconnecting.join).toHaveBeenCalledWith('tournament-match:p1');
    expect(sockEmit(reconnecting, 'tmatch:init')).toBeDefined();
  });

  test('a user with no live match is left untouched', () => {
    setupTournamentAndPairing();
    const io = makeIo();
    TournamentMatchHandler.startMatch(io, 't1', 'p1');

    const bystander = makeSocket('someone-else', 'Bystander');
    TournamentMatchHandler.resyncOnConnect(io, bystander);

    expect(bystander.join).not.toHaveBeenCalled();
    expect(sockEmit(bystander, 'tmatch:init')).toBeUndefined();
  });
});
