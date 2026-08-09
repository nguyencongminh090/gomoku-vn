'use strict';

/**
 * TournamentHandler.test.js — Unit tests for the tournament management
 * socket domain (Phase 4, TODO.md #48 / instruction.md B48).
 *
 * Strategy: mock TournamentManager entirely (mirrors LobbyHandler.test.js
 * mocking RoomManager) — this file tests the socket-layer translation
 * (payload validation, argument forwarding, authorization-error propagation,
 * event broadcasting), not PairingLifecycle/pairing-engine correctness,
 * which TournamentManager.test.js and PairingLifecycle.test.js already cover.
 *
 * `.on()` is captured into a plain dict so init()'s TournamentManager event
 * wiring (tournament_started/tournament_completed/pairing_changed) can be
 * triggered directly in tests, since the real module is mocked and isn't a
 * real EventEmitter here.
 */

jest.useFakeTimers();

let _handlers;
const mockTournamentManager = {
  on: jest.fn((event, cb) => { _handlers[event] = cb; }),
  createTournament: jest.fn(),
  registerPlayer: jest.fn(),
  unregisterPlayer: jest.fn(),
  startTournament: jest.fn(),
  getTournament: jest.fn(),
  listTournaments: jest.fn(() => []),
  listPairings: jest.fn(() => []),
  getPairing: jest.fn(),
  serializeTournament: jest.fn((t) => ({ tournamentId: t.tournamentId, name: t.name })),
  serializeTournamentUpdate: jest.fn((t) => ({ tournamentId: t.tournamentId, status: t.status })),
  serializePairing: jest.fn((p) => ({ pairingId: p.pairingId, state: p.state })),
  reportPairingTime: jest.fn(),
  confirmPairingTime: jest.fn(),
  disputePairingTime: jest.fn(),
  organizerResolvePairing: jest.fn(),
  organizerAdjustPairing: jest.fn(),
  requestPairingReschedule: jest.fn(),
  approvePairingReschedule: jest.fn(),
  denyPairingReschedule: jest.fn(),
  markPairingReady: jest.fn(),
};
jest.mock('../managers/tournament/TournamentManager', () => mockTournamentManager);

const mockTournamentMatchHandler = { startMatch: jest.fn() };
jest.mock('../socket/handlers/TournamentMatchHandler', () => mockTournamentMatchHandler);

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const TournamentHandler = require('../socket/handlers/TournamentHandler');

// ── Mock io/socket helpers (mirrors LobbyHandler.test.js) ──────────────────

function makeSocket(userId = 'u1', displayName = 'User 1') {
  const handlers = {};
  const socket = {
    user: { userId, displayName, isGuest: false },
    rooms: new Set(),
    _emitted: [],
    join: jest.fn(function (room) { this.rooms.add(room); }),
    leave: jest.fn(function (room) { this.rooms.delete(room); }),
    emit: jest.fn(function (event, data) { this._emitted.push({ event, data }); }),
    on: jest.fn((event, fn) => { handlers[event] = fn; }),
  };
  socket._handlers = handlers;
  return socket;
}

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
  };
  return io;
}

function fire(socket, event, payload) {
  return socket._handlers[event](payload || {});
}

function sockEmit(socket, event) {
  return socket._emitted.find((e) => e.event === event);
}

beforeEach(() => {
  _handlers = {};
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// tournament:subscribe / unsubscribe
// ---------------------------------------------------------------------------

describe('TournamentHandler — tournament:subscribe / unsubscribe', () => {
  test('subscribe joins tournament-lobby and sends the current list', () => {
    mockTournamentManager.listTournaments.mockReturnValue([{ tournamentId: 't1', name: 'A' }]);
    const io = makeIo();
    const socket = makeSocket();
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:subscribe');

    expect(socket.join).toHaveBeenCalledWith('tournament-lobby');
    expect(sockEmit(socket, 'tournament:list').data).toEqual({ tournaments: [{ tournamentId: 't1', name: 'A' }] });
  });

  test('unsubscribe leaves tournament-lobby', () => {
    const io = makeIo();
    const socket = makeSocket();
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:unsubscribe');

    expect(socket.leave).toHaveBeenCalledWith('tournament-lobby');
  });
});

// ---------------------------------------------------------------------------
// tournament:create
// ---------------------------------------------------------------------------

describe('TournamentHandler — tournament:create', () => {
  test('success: joins the tournament room and emits tournament:created', () => {
    const tournament = { tournamentId: 't1', name: 'Cup', status: 'draft' };
    mockTournamentManager.createTournament.mockReturnValue({ tournament });
    const io = makeIo();
    const socket = makeSocket('organizer1', 'Organizer');
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:create', { name: 'Cup', format: 'swiss' });

    expect(mockTournamentManager.createTournament).toHaveBeenCalledWith(
      { userId: 'organizer1', displayName: 'Organizer', isGuest: false },
      { name: 'Cup', format: 'swiss', ruleSet: undefined }
    );
    expect(socket.join).toHaveBeenCalledWith('tournament:t1');
    expect(sockEmit(socket, 'tournament:created').data).toEqual({ tournamentId: 't1', name: 'Cup' });
  });

  test('error: emits tournament:error and does not join any room', () => {
    mockTournamentManager.createTournament.mockReturnValue({ error: 'Thể thức không hợp lệ.', code: 'INVALID_FORMAT' });
    const io = makeIo();
    const socket = makeSocket();
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:create', { format: 'nope' });

    expect(sockEmit(socket, 'tournament:error').data.code).toBe('INVALID_FORMAT');
    expect(socket.join).not.toHaveBeenCalled();
    expect(sockEmit(socket, 'tournament:created')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// tournament:register / unregister
// ---------------------------------------------------------------------------

describe('TournamentHandler — tournament:register', () => {
  test('missing tournamentId is rejected without calling the manager', () => {
    const io = makeIo();
    const socket = makeSocket();
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:register', {});

    expect(sockEmit(socket, 'tournament:error').data.code).toBe('MISSING_TOURNAMENT_ID');
    expect(mockTournamentManager.registerPlayer).not.toHaveBeenCalled();
  });

  test('success: joins the tournament room and emits tournament:registered', () => {
    const tournament = { tournamentId: 't1', status: 'draft' };
    mockTournamentManager.registerPlayer.mockReturnValue({ tournament, entryId: 'e1' });
    const io = makeIo();
    const socket = makeSocket('p1', 'Player 1');
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:register', { tournamentId: 't1' });

    expect(socket.join).toHaveBeenCalledWith('tournament:t1');
    expect(sockEmit(socket, 'tournament:registered').data).toEqual({ tournamentId: 't1', entryId: 'e1' });
  });

  test('already-registered error is propagated, no join happens', () => {
    mockTournamentManager.registerPlayer.mockReturnValue({ error: 'Bạn đã đăng ký giải đấu này rồi.', code: 'ALREADY_REGISTERED' });
    const io = makeIo();
    const socket = makeSocket();
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:register', { tournamentId: 't1' });

    expect(sockEmit(socket, 'tournament:error').data.code).toBe('ALREADY_REGISTERED');
    expect(socket.join).not.toHaveBeenCalled();
  });

  // TODO.md #83 — register/unregister no longer broadcast
  // tournament:updated synchronously; they queue it via setImmediate so a
  // burst of near-simultaneous calls for the same tournament collapses into
  // one broadcast (mirrors _queuePairingChanged's existing pattern).
  test('a single register still flushes tournament:updated on the very next tick (no perceptible delay)', () => {
    const tournament = { tournamentId: 'treg-solo', status: 'draft' };
    mockTournamentManager.registerPlayer.mockReturnValue({ tournament, entryId: 'e1' });
    const io = makeIo();
    const socket = makeSocket('p1', 'Player 1');
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:register', { tournamentId: 'treg-solo' });

    expect(io._toEmitted['tournament:treg-solo']).toBeUndefined();
    jest.runAllTimers();
    expect(io._toEmitted['tournament:treg-solo']).toHaveLength(1);
    expect(io._toEmitted['tournament:treg-solo'][0].event).toBe('tournament:updated');
  });

  test('several registers for the same tournament in one synchronous burst collapse into one broadcast', () => {
    const tournament = { tournamentId: 'treg-burst', status: 'draft' };
    mockTournamentManager.registerPlayer.mockReturnValue({ tournament, entryId: 'e1' });
    const io = makeIo();
    const socketA = makeSocket('pA', 'Player A');
    const socketB = makeSocket('pB', 'Player B');
    TournamentHandler.register(io, socketA);
    TournamentHandler.register(io, socketB);

    fire(socketA, 'tournament:register', { tournamentId: 'treg-burst' });
    fire(socketB, 'tournament:register', { tournamentId: 'treg-burst' });
    jest.runAllTimers();

    expect(io._toEmitted['tournament:treg-burst']).toHaveLength(1);
  });
});

describe('TournamentHandler — tournament:unregister', () => {
  test('success: leaves the tournament room and emits tournament:unregistered', () => {
    mockTournamentManager.unregisterPlayer.mockReturnValue({ tournament: { tournamentId: 't1', status: 'draft' } });
    const io = makeIo();
    const socket = makeSocket();
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:unregister', { tournamentId: 't1' });

    expect(socket.leave).toHaveBeenCalledWith('tournament:t1');
    expect(sockEmit(socket, 'tournament:unregistered').data).toEqual({ tournamentId: 't1' });
  });

  test('not-registered error is propagated', () => {
    mockTournamentManager.unregisterPlayer.mockReturnValue({ error: 'Bạn chưa đăng ký giải đấu này.', code: 'NOT_REGISTERED' });
    const io = makeIo();
    const socket = makeSocket();
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:unregister', { tournamentId: 't1' });

    expect(sockEmit(socket, 'tournament:error').data.code).toBe('NOT_REGISTERED');
  });

  // TODO.md #83 — same setImmediate-queued broadcast as tournament:register.
  test('a register immediately followed by an unregister for the same tournament still collapses into one broadcast', () => {
    const tournament = { tournamentId: 'tmix-burst', status: 'draft' };
    mockTournamentManager.registerPlayer.mockReturnValue({ tournament, entryId: 'e1' });
    mockTournamentManager.unregisterPlayer.mockReturnValue({ tournament });
    const io = makeIo();
    const socket = makeSocket('p1', 'Player 1');
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:register', { tournamentId: 'tmix-burst' });
    fire(socket, 'tournament:unregister', { tournamentId: 'tmix-burst' });
    jest.runAllTimers();

    expect(io._toEmitted['tournament:tmix-burst']).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// tournament:start — organizer-only authorization pass-through
// ---------------------------------------------------------------------------

describe('TournamentHandler — tournament:start', () => {
  test('forwards userId to startTournament and emits nothing extra on success (broadcast happens via init() listener)', () => {
    mockTournamentManager.startTournament.mockReturnValue({ tournament: { tournamentId: 't1' } });
    const io = makeIo();
    const socket = makeSocket('organizer1', 'Organizer');
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:start', { tournamentId: 't1' });

    expect(mockTournamentManager.startTournament).toHaveBeenCalledWith('organizer1', 't1');
    expect(sockEmit(socket, 'tournament:error')).toBeUndefined();
  });

  test('a non-organizer is rejected — error propagated, no state-changing broadcast triggered by the handler', () => {
    mockTournamentManager.startTournament.mockReturnValue({ error: 'Chỉ người tổ chức mới có thể bắt đầu giải đấu.', code: 'ORGANIZER_ONLY' });
    const io = makeIo();
    const socket = makeSocket('not-organizer', 'Someone Else');
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:start', { tournamentId: 't1' });

    expect(sockEmit(socket, 'tournament:error').data.code).toBe('ORGANIZER_ONLY');
    expect(io.to).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// tournament:get
// ---------------------------------------------------------------------------

describe('TournamentHandler — tournament:get', () => {
  test('success: joins the room and emits tournament:detail with serialized pairings', () => {
    const tournament = { tournamentId: 't1', name: 'Cup', status: 'active' };
    mockTournamentManager.getTournament.mockReturnValue(tournament);
    mockTournamentManager.listPairings.mockReturnValue([{ pairingId: 'p1', state: 'Negotiating' }]);
    const io = makeIo();
    const socket = makeSocket();
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:get', { tournamentId: 't1' });

    expect(socket.join).toHaveBeenCalledWith('tournament:t1');
    const detail = sockEmit(socket, 'tournament:detail').data;
    expect(detail.tournament).toEqual({ tournamentId: 't1', name: 'Cup' });
    expect(detail.pairings).toEqual([{ pairingId: 'p1', state: 'Negotiating' }]);
  });

  test('unknown tournamentId emits TOURNAMENT_NOT_FOUND', () => {
    mockTournamentManager.getTournament.mockReturnValue(null);
    const io = makeIo();
    const socket = makeSocket();
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:get', { tournamentId: 'ghost' });

    expect(sockEmit(socket, 'tournament:error').data.code).toBe('TOURNAMENT_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// Pairing-scheduling actions — decision table: missing context / success / error
// ---------------------------------------------------------------------------

describe('TournamentHandler — pairing-scheduling actions', () => {
  const cases = [
    ['tournament:report_time', 'reportPairingTime', { proposedTime: '2026-08-10T10:00:00Z' }],
    ['tournament:confirm_time', 'confirmPairingTime', {}],
    ['tournament:dispute_time', 'disputePairingTime', {}],
    ['tournament:organizer_resolve', 'organizerResolvePairing', { finalTime: '2026-08-10T10:00:00Z' }],
    ['tournament:organizer_adjust', 'organizerAdjustPairing', { reason: 'no_show' }],
    ['tournament:request_reschedule', 'requestPairingReschedule', { newProposedTime: '2026-08-11T10:00:00Z' }],
    ['tournament:approve_reschedule', 'approvePairingReschedule', {}],
    ['tournament:deny_reschedule', 'denyPairingReschedule', {}],
    ['tournament:ready', 'markPairingReady', {}],
  ];

  test.each(cases)('%s rejects a payload missing tournamentId/pairingId without calling the manager', (event, managerMethod) => {
    const io = makeIo();
    const socket = makeSocket();
    TournamentHandler.register(io, socket);

    fire(socket, event, {});

    expect(sockEmit(socket, 'tournament:error').data.code).toBe('MISSING_PAIRING_CONTEXT');
    expect(mockTournamentManager[managerMethod]).not.toHaveBeenCalled();
  });

  test.each(cases)('%s propagates a manager error as tournament:error', (event, managerMethod) => {
    mockTournamentManager[managerMethod].mockReturnValue({ error: 'Không hợp lệ.', code: 'INVALID_STATE' });
    const io = makeIo();
    const socket = makeSocket();
    TournamentHandler.register(io, socket);

    fire(socket, event, { tournamentId: 't1', pairingId: 'p1' });

    expect(sockEmit(socket, 'tournament:error').data.code).toBe('INVALID_STATE');
  });

  test.each(cases)('%s emits nothing on success (broadcast is via the pairing_changed listener)', (event, managerMethod) => {
    mockTournamentManager[managerMethod].mockReturnValue({ pairing: { pairingId: 'p1' } });
    const io = makeIo();
    const socket = makeSocket();
    TournamentHandler.register(io, socket);

    fire(socket, event, { tournamentId: 't1', pairingId: 'p1' });

    expect(sockEmit(socket, 'tournament:error')).toBeUndefined();
  });

  test('organizer_resolve forwards userId, tournamentId, pairingId, finalTime in that order', () => {
    mockTournamentManager.organizerResolvePairing.mockReturnValue({ pairing: {} });
    const io = makeIo();
    const socket = makeSocket('organizer1', 'Organizer');
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:organizer_resolve', { tournamentId: 't1', pairingId: 'p1', finalTime: '2026-08-10T10:00:00Z' });

    expect(mockTournamentManager.organizerResolvePairing).toHaveBeenCalledWith('organizer1', 't1', 'p1', '2026-08-10T10:00:00Z');
  });

  test('a non-participant is rejected the same way as any other manager error', () => {
    mockTournamentManager.reportPairingTime.mockReturnValue({ error: 'Bạn không tham gia giải đấu này.', code: 'NOT_A_PARTICIPANT' });
    const io = makeIo();
    const socket = makeSocket('spectator1', 'Spectator');
    TournamentHandler.register(io, socket);

    fire(socket, 'tournament:report_time', { tournamentId: 't1', pairingId: 'p1', proposedTime: 'x' });

    expect(sockEmit(socket, 'tournament:error').data.code).toBe('NOT_A_PARTICIPANT');
  });
});

// ---------------------------------------------------------------------------
// init(io) — TournamentManager event -> broadcast wiring
// ---------------------------------------------------------------------------

describe('TournamentHandler — init(io) event wiring', () => {
  test('tournament_started broadcasts the tournament to its room', () => {
    mockTournamentManager.getTournament.mockReturnValue({ tournamentId: 't1', status: 'active' });
    const io = makeIo();
    TournamentHandler.init(io);

    _handlers['tournament_started']('t1');

    expect(io._toEmitted['tournament:t1']).toContainEqual({
      event: 'tournament:updated',
      data: { tournamentId: 't1', status: 'active' },
    });
  });

  test('tournament_completed broadcasts the tournament to its room', () => {
    mockTournamentManager.getTournament.mockReturnValue({ tournamentId: 't1', status: 'completed' });
    const io = makeIo();
    TournamentHandler.init(io);

    _handlers['tournament_completed']('t1');

    expect(io._toEmitted['tournament:t1']).toContainEqual({
      event: 'tournament:updated',
      data: { tournamentId: 't1', status: 'completed' },
    });
  });

  test('pairing_changed broadcasts the serialized pairing to the tournament room, batched via a pairings_patch', () => {
    mockTournamentManager.getPairing.mockReturnValue({ pairingId: 'p1', state: 'Ready' });
    const io = makeIo();
    TournamentHandler.init(io);

    _handlers['pairing_changed']({ tournamentId: 't1', pairingId: 'p1' });
    jest.runAllTimers();

    expect(io._toEmitted['tournament:t1']).toContainEqual({
      event: 'tournament:pairings_patch',
      data: { tournamentId: 't1', pairings: [{ pairingId: 'p1', state: 'Ready' }] },
    });
  });

  test('pairing_changed for a since-vanished pairing is a safe no-op', () => {
    mockTournamentManager.getPairing.mockReturnValue(null);
    const io = makeIo();
    TournamentHandler.init(io);

    _handlers['pairing_changed']({ tournamentId: 't1', pairingId: 'ghost' });
    expect(() => jest.runAllTimers()).not.toThrow();
    expect(io._toEmitted['tournament:t1']).toBeUndefined();
  });

  test('several pairing_changed events for the same tournament in one synchronous burst coalesce into a single pairings_patch', () => {
    mockTournamentManager.getPairing.mockImplementation((pairingId) => ({ pairingId, state: 'Reported' }));
    const io = makeIo();
    TournamentHandler.init(io);

    _handlers['pairing_changed']({ tournamentId: 't1', pairingId: 'p1' });
    _handlers['pairing_changed']({ tournamentId: 't1', pairingId: 'p2' });
    _handlers['pairing_changed']({ tournamentId: 't1', pairingId: 'p3' });
    jest.runAllTimers();

    const patches = io._toEmitted['tournament:t1'].filter((e) => e.event === 'tournament:pairings_patch');
    expect(patches).toHaveLength(1);
    expect(patches[0].data.pairings.map((p) => p.pairingId).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  test('a second pairing_changed for the same pairingId within one burst is deduplicated to its latest state', () => {
    const states = { p1: 'Reported' };
    mockTournamentManager.getPairing.mockImplementation((pairingId) => ({ pairingId, state: states[pairingId] }));
    const io = makeIo();
    TournamentHandler.init(io);

    _handlers['pairing_changed']({ tournamentId: 't1', pairingId: 'p1' });
    states.p1 = 'Ready';
    _handlers['pairing_changed']({ tournamentId: 't1', pairingId: 'p1' });
    jest.runAllTimers();

    const patches = io._toEmitted['tournament:t1'].filter((e) => e.event === 'tournament:pairings_patch');
    expect(patches).toHaveLength(1);
    expect(patches[0].data.pairings).toEqual([{ pairingId: 'p1', state: 'Ready' }]);
  });

  test('pairing_changed bursts for different tournaments do not merge into one patch', () => {
    mockTournamentManager.getPairing.mockImplementation((pairingId) => ({ pairingId, state: 'Reported' }));
    const io = makeIo();
    TournamentHandler.init(io);

    _handlers['pairing_changed']({ tournamentId: 't1', pairingId: 'p1' });
    _handlers['pairing_changed']({ tournamentId: 't2', pairingId: 'p2' });
    jest.runAllTimers();

    expect(io._toEmitted['tournament:t1']).toContainEqual({
      event: 'tournament:pairings_patch',
      data: { tournamentId: 't1', pairings: [{ pairingId: 'p1', state: 'Reported' }] },
    });
    expect(io._toEmitted['tournament:t2']).toContainEqual({
      event: 'tournament:pairings_patch',
      data: { tournamentId: 't2', pairings: [{ pairingId: 'p2', state: 'Reported' }] },
    });
  });

  // Regression test: this exact wiring was missing end-to-end until a real
  // Playwright run caught it — TournamentManager.markPairingReady() emits
  // 'pairing_ready' when both players check in, but nothing called
  // TournamentMatchHandler.startMatch() for it, so a pairing sat at
  // InProgress forever with no GameEngine behind it. Unit tests that called
  // startMatch() directly (TournamentMatchHandler.test.js) never exercised
  // this wire, which is exactly why it slipped through.
  test('pairing_ready calls TournamentMatchHandler.startMatch with the right io/tournamentId/pairingId', () => {
    const io = makeIo();
    TournamentHandler.init(io);

    _handlers['pairing_ready']({ tournamentId: 't1', pairingId: 'p1' });

    expect(mockTournamentMatchHandler.startMatch).toHaveBeenCalledWith(io, 't1', 'p1');
  });

  test('a completed tournament_started callback with an unknown tournamentId does not throw', () => {
    mockTournamentManager.getTournament.mockReturnValue(null);
    const io = makeIo();
    TournamentHandler.init(io);

    expect(() => _handlers['tournament_started']('ghost')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// broadcastTournamentDetail — entries diff. serializeTournamentUpdate()
// includes the FULL entries array on every call (every registered player),
// so before this fix a tournament:updated broadcast after a single
// register/unregister re-sent every other already-known entry too. Diffed
// the same way state.js's _diffRoomUsers diffs a room's users. Each test
// below uses its own tournamentId so the per-tournamentId snapshot Map
// (module-level, not reset between tests) can't leak state across cases.
// ---------------------------------------------------------------------------
describe('TournamentHandler — broadcastTournamentDetail entries diff', () => {
  test('first broadcast for a tournament upserts every current entry, with no removed', () => {
    mockTournamentManager.serializeTournamentUpdate.mockReturnValue({
      tournamentId: 'te-first', status: 'draft',
      entries: [{ entryId: 'e1', userId: 'u1' }, { entryId: 'e2', userId: 'u2' }],
    });
    const io = makeIo();
    TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-first' });

    const payload = io._toEmitted['tournament:te-first'][0].data;
    expect(payload.entries.upserts.map((e) => e.entryId).sort()).toEqual(['e1', 'e2']);
    expect(payload.entries.removed).toEqual([]);
  });

  test('a second broadcast with no entry changes omits `entries` entirely', () => {
    const entries = [{ entryId: 'e1', userId: 'u1' }];
    mockTournamentManager.serializeTournamentUpdate.mockReturnValue({ tournamentId: 'te-nochange', status: 'draft', entries });
    const io = makeIo();
    TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-nochange' });
    TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-nochange' });

    expect(io._toEmitted['tournament:te-nochange'][1].data).not.toHaveProperty('entries');
  });

  test('only a newly-registered entry appears in upserts', () => {
    mockTournamentManager.serializeTournamentUpdate.mockReturnValue({
      tournamentId: 'te-added', status: 'draft', entries: [{ entryId: 'e1', userId: 'u1' }],
    });
    const io = makeIo();
    TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-added' });

    mockTournamentManager.serializeTournamentUpdate.mockReturnValue({
      tournamentId: 'te-added', status: 'draft',
      entries: [{ entryId: 'e1', userId: 'u1' }, { entryId: 'e2', userId: 'u2' }],
    });
    TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-added' });

    const second = io._toEmitted['tournament:te-added'][1].data;
    expect(second.entries.upserts.map((e) => e.entryId)).toEqual(['e2']);
    expect(second.entries.removed).toEqual([]);
  });

  test('an unregistered entry appears in removed, not upserts', () => {
    mockTournamentManager.serializeTournamentUpdate.mockReturnValue({
      tournamentId: 'te-removed', status: 'draft',
      entries: [{ entryId: 'e1', userId: 'u1' }, { entryId: 'e2', userId: 'u2' }],
    });
    const io = makeIo();
    TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-removed' });

    mockTournamentManager.serializeTournamentUpdate.mockReturnValue({
      tournamentId: 'te-removed', status: 'draft', entries: [{ entryId: 'e1', userId: 'u1' }],
    });
    TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-removed' });

    const second = io._toEmitted['tournament:te-removed'][1].data;
    expect(second.entries.removed).toEqual(['e2']);
    expect(second.entries.upserts).toEqual([]);
  });

  test('entries are diffed independently per tournament', () => {
    const io = makeIo();
    mockTournamentManager.serializeTournamentUpdate.mockImplementation((t) => ({
      tournamentId: t.tournamentId, status: 'draft', entries: [{ entryId: 'e1', userId: 'u1' }],
    }));
    TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-p1' });
    TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-p2' });

    mockTournamentManager.serializeTournamentUpdate.mockImplementation((t) => ({
      tournamentId: t.tournamentId, status: 'draft',
      entries: t.tournamentId === 'te-p2'
        ? [{ entryId: 'e1', userId: 'u1' }, { entryId: 'e2', userId: 'u2' }]
        : [{ entryId: 'e1', userId: 'u1' }],
    }));
    TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-p1' });
    TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-p2' });

    expect(io._toEmitted['tournament:te-p1'][1].data).not.toHaveProperty('entries');
    expect(io._toEmitted['tournament:te-p2'][1].data.entries.upserts.map((e) => e.entryId)).toEqual(['e2']);
  });

  test('scalar fields are always included alongside a diffed entries patch', () => {
    mockTournamentManager.serializeTournamentUpdate.mockReturnValue({
      tournamentId: 'te-scalars', status: 'active', currentRoundIndex: 2,
      entries: [{ entryId: 'e1', userId: 'u1' }],
    });
    const io = makeIo();
    TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-scalars' });

    const payload = io._toEmitted['tournament:te-scalars'][0].data;
    expect(payload.status).toBe('active');
    expect(payload.currentRoundIndex).toBe(2);
  });

  test('a tournament with no entries field at all (mocked default) broadcasts without an entries key', () => {
    // Regression guard: serializeTournamentUpdate mocks elsewhere in this file
    // return no `entries` field — must not throw on `full.entries` being
    // undefined (guarded with `|| []` in TournamentHandler.js).
    mockTournamentManager.serializeTournamentUpdate.mockReturnValue({ tournamentId: 'te-no-entries', status: 'draft' });
    const io = makeIo();

    expect(() => TournamentHandler.broadcastTournamentDetail(io, { tournamentId: 'te-no-entries' })).not.toThrow();
    expect(io._toEmitted['tournament:te-no-entries'][0].data).not.toHaveProperty('entries');
  });
});
