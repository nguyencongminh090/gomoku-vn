'use strict';

/**
 * rated-absence.test.js — #493 (features/presence-status §3, Q1/Q2/Q11/Q12/Q13 A): a player who drops from a
 * RATED game does not pause it. Their clock runs; an absence budget W (never refilled) is spent on their own
 * turn; W out → loss 'abandon' (rated, persisted); before both acted → abort (void); both gone → void; during
 * a site-wide outage → void. Casual games keep the old pause path (DisconnectHandler.test.js).
 *
 * Real state.js, RoomManager, GameEngine, DisconnectHandler, GameHandler.handleGameEnd; DB and rating queue stubbed.
 */

jest.useFakeTimers();

jest.mock('../utils/logger', () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../socket/home-feed', () => ({ scheduleHomeUpdate: jest.fn(), register: jest.fn() }));
jest.mock('../managers/rank-cache', () => ({ standingOf: () => null, ratingsOf: () => ({}), onChange: () => {} }));
jest.mock('../db/database', () => ({ saveGame: jest.fn() }));
// #495: the repeat-leaver store is checked by its own suite (abandonment-limits); here only the calls.
const mockAbandon = { record: jest.fn(), budgetFor: jest.fn((id, base) => base), cooldownLeftMs: jest.fn(() => 0) };
jest.mock('../managers/AbandonmentService', () => mockAbandon);
jest.mock('../managers/RatingService', () => {
  const actual = jest.requireActual('../managers/RatingService');
  return { ...actual, recordGame: jest.fn(() => true) };
});

const database = require('../db/database');
const RatingService = require('../managers/RatingService');
const state = require('../socket/state');
const roomManager = require('../managers/RoomManager');
const { GameEngine } = require('../managers/GameEngine');
const TimerManager = require('../managers/TimerManager');
const DisconnectHandler = require('../socket/handlers/DisconnectHandler');

function makeIo() {
  const log = [];
  return { log, to: (t) => ({ emit: (event, data) => log.push({ to: t, event, data }) }), in: () => ({ socketsLeave() {} }) };
}
function makeSocket(userId, roomId) {
  const sent = [];
  return {
    id: 's-' + userId + Math.random(), user: { userId, displayName: userId.toUpperCase(), isGuest: false },
    data: roomId ? { roomPageId: roomId } : {}, sent,
    emit: (event, data) => sent.push({ event, data }), join() {}, leave() {},
    to: () => ({ emit: (event, data) => sent.push({ event: 'to:' + event, data }) }),
  };
}

let io; let room; let engine; let timer;
/** A rated a (BLACK) vs b (WHITE) game; `moves` = stones already played (a then b alternately). */
function setup({ moves = 2, settings = { timerMode: 'per_game', timerSeconds: 600 }, ranked = true } = {}) {
  io = makeIo();
  room = roomManager.createRoom({ userId: 'a', displayName: 'A', isGuest: false }, settings).room;
  roomManager.joinRoom({ userId: 'b', displayName: 'B', isGuest: false }, room.roomId);
  roomManager.sitDown('a', 1);
  roomManager.sitDown('b', 2);
  Object.assign(room.settings, settings);
  engine = new GameEngine({
    roomId: room.roomId, boardSize: 15, winningRule: 'freestyle',
    players: [{ userId: 'a', displayName: 'A', color: 'BLACK', isGuest: false }, { userId: 'b', displayName: 'B', color: 'WHITE', isGuest: false }],
  });
  engine.ranked = ranked;
  const cells = [[7, 7], [8, 8], [7, 8], [8, 7]];
  for (let i = 0; i < moves; i++) engine.makeMove(i % 2 ? 'b' : 'a', ...cells[i]);
  room.gameState = engine;
  room.state = 'playing';
  timer = new TimerManager({ roomId: room.roomId, mode: settings.timerMode, seconds: settings.timerSeconds, blackPlayerId: 'a', whitePlayerId: 'b' });
  timer.activeColor = engine.currentTurn === 'a' ? 'black' : 'white';
  state.timerMap.set(room.roomId, timer);
  timer.start();
  for (const id of ['a', 'b']) state.sessions.set(id, makeSocket(id, room.roomId));
}
function drop(id) {
  const s = state.sessions.get(id);
  state.sessions.delete(id);
  DisconnectHandler.handleDisconnect(io, s);
}
const events = (name) => io.log.filter((e) => e.event === name);

beforeEach(() => {
  database.saveGame.mockClear(); RatingService.recordGame.mockClear(); DisconnectHandler._resetOutage();
  mockAbandon.record.mockClear(); mockAbandon.budgetFor.mockImplementation((id, base) => base);
});
afterEach(() => {
  for (const e of state.disconnectTimers.values()) { clearTimeout(e.timeout); clearInterval(e.countdown); }
  state.disconnectTimers.clear();
  for (const e of state.spectatorGraceTimers.values()) clearTimeout(e.timeout);
  state.spectatorGraceTimers.clear();
  for (const t of state.timerMap.values()) t.stop();
  state.timerMap.clear();
  for (const id of [...roomManager.rooms.keys()]) roomManager._destroyRoom(id);
  roomManager.userRoomMap.clear();
  state.sessions.clear();
  jest.clearAllTimers();
});

describe('absence window W by time control', () => {
  test.each([
    [{ timerMode: 'per_game', timerSeconds: 180 }, 30_000],
    [{ timerMode: 'per_game', timerSeconds: 600 }, 60_000],
    [{ timerMode: 'per_game', timerSeconds: 1200 }, 120_000],
    [{ timerMode: 'per_game', timerSeconds: 3600 }, 120_000],
    [{ timerMode: 'blitz', timerSeconds: 180, timerIncrementSeconds: 2 }, 30_000],
    [{ timerMode: 'blitz', timerSeconds: 300, timerIncrementSeconds: 10 }, 70_000],
    [{ timerMode: 'per_move', timerSeconds: 60 }, 60_000],
  ])('%j → %d ms', (s, ms) => expect(DisconnectHandler.absenceWindowMs(s)).toBe(ms));
});

describe('rated game: the clock keeps running, no pause', () => {
  test('drop on own turn: game stays playing, clock running, one game:absent, member disconnected', () => {
    setup({ moves: 2 }); // a to move
    drop('a');
    expect(room.state).toBe('playing');
    expect(timer.getSync().running).toBe(true);
    expect(events('game:interrupted')).toHaveLength(0);
    expect(events('game:absent').map((e) => e.data)).toEqual([{ playerId: 'a', playerName: 'A', abortable: false }]);
    expect(room.users.get('a').presence).toBe('disconnected');
  });

  test('problem 1: W out on own turn → loss by abandonment, rated and persisted', () => {
    setup({ moves: 2 });
    drop('a');
    jest.advanceTimersByTime(60_000 + 1_500);
    expect(engine.result).toEqual({ winner: 'b', reason: 'abandon' });
    expect(database.saveGame).toHaveBeenCalledTimes(1);
    expect(database.saveGame.mock.calls[0][0]).toMatchObject({ ranked: true, result: { winner: 'b', reason: 'abandon' } });
    expect(RatingService.recordGame).toHaveBeenCalledTimes(1);
    expect(events('game:ended')).toHaveLength(1);
    expect(events('chat:message').some((e) => e.data.code === 'PLAYER_ABANDONED')).toBe(true);
    expect(room.users.get('a').slot).toBeNull(); // seat lapsed, stays as viewer (#367)
    expect(engine.absence.absentAtEnd).toEqual(['a']);
    expect(state.disconnectTimers.has('a')).toBe(false);
  });

  test('drop on the opponent\'s turn: W only starts when the turn reaches the absent player', () => {
    setup({ moves: 3 }); // b to move
    drop('a');
    jest.advanceTimersByTime(90_000); // b thinks for 90 s: a's budget untouched
    expect(engine.status).toBe('ongoing');
    expect(engine.absence.left.a).toBe(60_000);
    engine.makeMove('b', 8, 7);
    timer.activeColor = 'black';
    jest.advanceTimersByTime(30_000);
    expect(engine.absence.left.a).toBeLessThanOrEqual(31_000);
    expect(engine.status).toBe('ongoing');
    jest.advanceTimersByTime(31_500);
    expect(engine.result).toEqual({ winner: 'b', reason: 'abandon' });
  });

  test('problem 2: return keeps the remaining budget; a second drop does not refill it', () => {
    setup({ moves: 2 });
    drop('a');
    jest.advanceTimersByTime(40_000);
    const back = makeSocket('a', room.roomId);
    state.sessions.set('a', back);
    expect(DisconnectHandler.cancelDisconnectGrace(io, back)).toBe(true);
    expect(back.sent.map((e) => e.event)).toEqual(['to:game:resumed', 'game:init']);
    expect(room.users.get('a').presence).toBe('active');
    const left = engine.absence.left.a;
    expect(left).toBeLessThanOrEqual(21_000);
    drop('a');
    jest.advanceTimersByTime(left + 1_500);
    expect(engine.result).toEqual({ winner: 'b', reason: 'abandon' });
  });

  test('#422 page bounce during the absence does not touch the budget or restart anything', () => {
    setup({ moves: 2 });
    drop('a');
    jest.advanceTimersByTime(10_000);
    const lobby = makeSocket('a'); // a non-room page that never rejoined the game
    state.sessions.set('a', lobby);
    state.sessions.delete('a');
    DisconnectHandler.handleDisconnect(io, lobby);
    expect(events('game:absent')).toHaveLength(1);
    expect(engine.absence.left.a).toBeLessThanOrEqual(51_000);
  });

  test('clock timeout while absent ends the game once; the seat goes to the normal seat grace', () => {
    setup({ moves: 2, settings: { timerMode: 'per_game', timerSeconds: 20 } }); // W = 30 s > clock 20 s
    timer.onTimeout = (id) => { engine.handleTimeout(id); require('../socket/handlers/GameHandler').handleGameEnd(io, room); io.to(room.roomId).emit('game:ended', {}); };
    drop('a');
    jest.advanceTimersByTime(25_000);
    expect(engine.result).toEqual({ winner: 'b', reason: 'timeout' });
    expect(events('game:ended')).toHaveLength(1);
    expect(state.disconnectTimers.has('a')).toBe(false);
    expect(state.spectatorGraceTimers.has('a')).toBe(true);
  });
});

describe('abort, both gone, outage (void, never rated)', () => {
  test('Q12: before both players acted → abort after 30 s, void', () => {
    setup({ moves: 1 }); // a played, b never acted; b to move
    drop('b');
    expect(events('game:absent')[0].data.abortable).toBe(true);
    jest.advanceTimersByTime(DisconnectHandler.ABORT_MS + 1_500);
    expect(engine.result).toEqual({ winner: null, reason: 'abort' });
    expect(database.saveGame).not.toHaveBeenCalled();
    expect(RatingService.recordGame).not.toHaveBeenCalled();
  });

  test('the absent player never acted: still abortable even after the other moves', () => {
    setup({ moves: 0 }); // nobody acted; a to move
    drop('b');
    engine.makeMove('a', 7, 7); // a acts; b still has not
    jest.advanceTimersByTime(DisconnectHandler.ABORT_MS + 1_500);
    expect(engine.result).toEqual({ winner: null, reason: 'abort' });
  });

  test('abortable drop becomes a normal absence once the other player acts', () => {
    setup({ moves: 1 }); // a acted, b not yet; b to move
    drop('a');
    expect(events('game:absent')[0].data.abortable).toBe(true);
    engine.makeMove('b', 8, 8); // now both acted → a's absence is a normal one
    timer.activeColor = 'black';
    jest.advanceTimersByTime(DisconnectHandler.ABORT_MS + 1_500);
    expect(engine.status).toBe('ongoing');
    jest.advanceTimersByTime(60_000);
    expect(engine.result).toEqual({ winner: 'b', reason: 'abandon' });
  });

  test('Q11: both players gone 15 s → void', () => {
    setup({ moves: 2 });
    drop('a');
    drop('b');
    jest.advanceTimersByTime(DisconnectHandler.BOTH_GONE_MS + 1_500);
    expect(engine.result).toEqual({ winner: null, reason: 'both_absent' });
    expect(database.saveGame).not.toHaveBeenCalled();
    expect(events('game:ended')).toHaveLength(1);
  });

  const flood = (n, prefix = 'lobby') => { for (let i = 0; i < n; i++) DisconnectHandler.handleDisconnect(io, makeSocket(prefix + i)); };

  test('Q13: a real outage (both seats dropped with many others) → the expired absence is void, not a loss', () => {
    setup({ moves: 2 });
    flood(12);
    drop('a');
    drop('b');
    expect(DisconnectHandler.inOutage()).toBe(true);
    const back = makeSocket('b', room.roomId); // b comes back first, a does not
    state.sessions.set('b', back);
    DisconnectHandler.cancelDisconnectGrace(io, back);
    jest.advanceTimersByTime(61_500);
    expect(engine.result).toEqual({ winner: null, reason: 'disconnect' });
    expect(database.saveGame).not.toHaveBeenCalled();
  });

  test('security: guest tabs do not count toward an outage', () => {
    setup({ moves: 2 });
    flood(20, 'guest_tab'); // throwaway guest tabs closed together
    expect(DisconnectHandler.inOutage()).toBe(false);
  });

  test('security: a member flood with the opponent still connected does not void the abandonment', () => {
    setup({ moves: 2 });
    flood(12); // e.g. accounts the leaver controls
    expect(DisconnectHandler.inOutage()).toBe(true);
    drop('a'); // b never dropped
    jest.advanceTimersByTime(61_500);
    expect(engine.result).toEqual({ winner: 'b', reason: 'abandon' });
    expect(DisconnectHandler.voidsClockTimeout(room.roomId, 'a')).toBe(false);
  });

  test('security: both seats dropped but far apart (> 15 s) is not one outage for this game', () => {
    setup({ moves: 2 });
    flood(12);
    drop('a');
    jest.advanceTimersByTime(20_000);
    drop('b');
    const back = makeSocket('b', room.roomId);
    state.sessions.set('b', back);
    DisconnectHandler.cancelDisconnectGrace(io, back);
    jest.advanceTimersByTime(45_000);
    expect(engine.result).toEqual({ winner: 'b', reason: 'abandon' });
  });

  test('security: one account flapping its socket counts once (no outage)', () => {
    setup({ moves: 2 });
    for (let i = 0; i < 20; i++) DisconnectHandler.handleDisconnect(io, makeSocket('flapper'));
    expect(DisconnectHandler.inOutage()).toBe(false);
  });

  test('Q13: an absent player\'s clock timeout during a real outage is void too', () => {
    setup({ moves: 2 });
    flood(12);
    drop('a');
    drop('b');
    expect(DisconnectHandler.voidsClockTimeout(room.roomId, 'a')).toBe(true);
  });

  test('a few unrelated drops do not open the outage window', () => {
    setup({ moves: 2 });
    for (let i = 0; i < 3; i++) DisconnectHandler.handleDisconnect(io, makeSocket('lobby' + i));
    expect(DisconnectHandler.inOutage()).toBe(false);
  });
});

describe('casual games keep the old pause path', () => {
  test('an unrated game pauses and emits game:interrupted', () => {
    setup({ moves: 2, ranked: false });
    drop('a');
    expect(room.state).toBe('interrupted');
    expect(timer.getSync().running).toBe(false);
    expect(events('game:interrupted')).toHaveLength(1);
    expect(events('game:absent')).toHaveLength(0);
  });
});

describe('#494 casual games: one cumulative 60 s grace per player per game (Q3 A)', () => {
  test('problem 2 for casual: a return does not refill the grace; the second drop gets what is left', () => {
    setup({ moves: 2, ranked: false });
    drop('a');
    jest.advanceTimersByTime(40_000);
    const back = makeSocket('a', room.roomId);
    state.sessions.set('a', back);
    expect(DisconnectHandler.cancelDisconnectGrace(io, back)).toBe(true);
    expect(engine.absence.left.a).toBe(20_000);
    io.log.length = 0;
    drop('a');
    expect(events('game:interrupted')[0].data.secondsLeft).toBe(20);
    jest.advanceTimersByTime(19_000);
    expect(engine.status).toBe('ongoing');
    jest.advanceTimersByTime(1_500);
    expect(engine.result).toEqual({ winner: null, reason: 'disconnect' }); // casual expiry stays void
    expect(database.saveGame).not.toHaveBeenCalled();
  });

  test('budgets are per player: the opponent still has a full 60 s', () => {
    setup({ moves: 2, ranked: false });
    drop('a');
    jest.advanceTimersByTime(30_000);
    const back = makeSocket('a', room.roomId);
    state.sessions.set('a', back);
    DisconnectHandler.cancelDisconnectGrace(io, back);
    io.log.length = 0;
    drop('b');
    expect(events('game:interrupted')[0].data.secondsLeft).toBe(60);
  });
});

describe('#495 repeat leavers', () => {
  test('an abandonment is recorded against the leaver; an abort too', () => {
    setup({ moves: 2 });
    drop('a');
    jest.advanceTimersByTime(61_500);
    expect(mockAbandon.record).toHaveBeenCalledWith('a', engine.gameId, 'abandon');
  });

  test('abort is recorded against the absent player', () => {
    setup({ moves: 1 });
    drop('b');
    jest.advanceTimersByTime(31_500);
    expect(mockAbandon.record).toHaveBeenCalledWith('b', engine.gameId, 'abort');
  });

  test('voids are never recorded (both gone, outage)', () => {
    setup({ moves: 2 });
    drop('a');
    drop('b');
    jest.advanceTimersByTime(16_500);
    expect(engine.result.reason).toBe('both_absent');
    expect(mockAbandon.record).not.toHaveBeenCalled();
  });

  test('a repeat leaver gets the halved budget from the service', () => {
    mockAbandon.budgetFor.mockImplementation((id, base) => (id === 'a' ? Math.max(15_000, base / 2) : base));
    setup({ moves: 2 });
    drop('a');
    expect(engine.absence.left.a).toBe(30_000);
    jest.advanceTimersByTime(31_500);
    expect(engine.result).toEqual({ winner: 'b', reason: 'abandon' });
  });
});
