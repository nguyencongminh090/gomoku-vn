'use strict';
// #427 — GameHandler drives a Renju Taraguchi-10 / Yamaguchi opening over the Swap2 transport.

const mockRoomManager = { getRoomByUser: jest.fn() };
jest.mock('../managers/RoomManager', () => mockRoomManager);
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../db/database', () => ({ saveGame: jest.fn() }));
const mockState = {
  timerMap: new Map(),
  broadcastLobbyUpdate: jest.fn(),
  scheduleLobbyBoardUpdate: jest.fn(),
  broadcastRoomUpdate: jest.fn(),
  cleanupRoomTimer: jest.fn(),
  cleanupReadyTimer: jest.fn(),
};
jest.mock('../socket/state', () => mockState);

const GameHandler = require('../socket/handlers/GameHandler');
const TimerManager = require('../managers/TimerManager');
const { GameEngine } = require('../managers/GameEngine');

function makeIo() {
  const io = { emitted: [], to: jest.fn(() => ({ emit: (event, data) => io.emitted.push({ event, data }) })) };
  return io;
}
function makeSocket(userId) {
  const handlers = {};
  return { user: { userId, displayName: userId }, handlers, emitted: [], on: (e, cb) => { handlers[e] = cb; }, emit(event, data) { this.emitted.push({ event, data }); } };
}
function setup(openingRule, realTimer = null) {
  const io = makeIo();
  const engine = new GameEngine({
    roomId: 'room1', boardSize: 15, walls: [], portals: [], firstMoveZones: [], winningRule: 'renju', openingRule,
    players: [{ userId: 'p1', displayName: 'p1', color: null }, { userId: 'p2', displayName: 'p2', color: null }],
  });
  const room = { roomId: 'room1', gameState: engine };
  mockRoomManager.getRoomByUser.mockReturnValue(room);
  const timer = realTimer || { switchTurn: jest.fn(), remapForSwap2: jest.fn(), getSync: jest.fn(() => ({})) };
  mockState.timerMap.set('room1', timer);
  const s = { p1: makeSocket('p1'), p2: makeSocket('p2') };
  GameHandler.register(io, s.p1);
  GameHandler.register(io, s.p2);
  return { io, engine, timer, s };
}
const events = (io, name) => io.emitted.filter((e) => e.event === name).map((e) => e.data);

beforeEach(() => { jest.clearAllMocks(); mockState.timerMap.clear(); });

test('Taraguchi: placing B1 hands the swap decision (and the clock) to the other player', () => {
  const { io, engine, timer, s } = setup('taraguchi10');
  s.p1.handlers['game:swap2_place']({ x: 7, y: 7 });
  const st = events(io, 'game:swap2_state').pop();
  expect(st.swap2).toMatchObject({ enabled: true, rule: 'taraguchi10', step: 'swap', choices: ['stay', 'swap'] });
  expect(st.lastStone).toEqual({ x: 7, y: 7, color: 'BLACK' });
  expect(timer.switchTurn).toHaveBeenLastCalledWith('white');
  // A swap gives the move back to p1 — the clock follows.
  s.p2.handlers['game:swap2_choice']({ choice: 'swap' });
  expect(engine.currentTurn).toBe('p1');
  expect(timer.switchTurn).toHaveBeenLastCalledWith('black');
});

test('Taraguchi: move 3 posts the opening name to chat', () => {
  const { io, s } = setup('taraguchi10');
  s.p1.handlers['game:swap2_place']({ x: 7, y: 7 });
  s.p2.handlers['game:swap2_choice']({ choice: 'stay' });
  s.p2.handlers['game:swap2_place']({ x: 7, y: 6 });
  s.p1.handlers['game:swap2_choice']({ choice: 'stay' });
  s.p1.handlers['game:swap2_place']({ x: 7, y: 5 });
  expect(events(io, 'chat:message').some((m) => m.code === 'GAME_OPENING_DIRECT' && m.vars.name === 'Kansei')).toBe(true);
});

test('Yamaguchi: declare N via payload.n; picking an offer ends the opening and remaps the timer', () => {
  const { io, engine, timer, s } = setup('yamaguchi');
  s.p1.handlers['game:swap2_place']({ x: 7, y: 7 });
  s.p1.handlers['game:swap2_place']({ x: 7, y: 6 });
  s.p1.handlers['game:swap2_place']({ x: 7, y: 5 });
  s.p1.handlers['game:swap2_choice']({ choice: 'declare', n: 1 });
  expect(engine.offerN).toBe(1);
  s.p2.handlers['game:swap2_choice']({ choice: 'stay' });
  s.p2.handlers['game:swap2_place']({ x: 0, y: 0 });
  s.p1.handlers['game:swap2_place']({ x: 3, y: 3 });
  const offerState = events(io, 'game:swap2_state').pop();
  expect(offerState.lastStone).toBeNull(); // an offer is not a stone
  expect(offerState.swap2.offers).toEqual([{ x: 3, y: 3 }]);
  s.p2.handlers['game:swap2_place']({ x: 3, y: 3 });
  expect(engine.openingPhase).toBe('play');
  expect(timer.remapForSwap2).toHaveBeenCalledWith('p1', 'p2');
  expect(events(io, 'chat:message').some((m) => m.code === 'SWAP2_OPENING_DONE')).toBe(true);
  expect(events(io, 'game:swap2_state').pop().swap2.colorsAssigned).toBe(true);
});

test('an out-of-zone stone is refused with its code', () => {
  const { s } = setup('taraguchi10');
  s.p1.handlers['game:swap2_place']({ x: 8, y: 7 });
  expect(s.p1.emitted.pop()).toMatchObject({ event: 'game:error', data: { code: 'OPENING_NOT_CENTRE' } });
});

// User 2026-11-21: per_move refreshes the actor's window on every opening step.
describe('per_move clock refreshes per opening step (#427)', () => {
  const perMove = (mode = 'per_move') => new TimerManager({ roomId: 'room1', mode, seconds: 60, blackPlayerId: 'p1', whitePlayerId: 'p2' });

  test('Yamaguchi: each of the first player\'s 3 stones and the N declaration gets a fresh window', () => {
    const timer = perMove();
    const { io, s } = setup('yamaguchi', timer);
    for (const [x, y] of [[7, 7], [7, 6], [7, 5]]) {
      timer.black = 5;
      s.p1.handlers['game:swap2_place']({ x, y });
      expect(timer.black).toBe(60);
      expect(timer.activeColor).toBe('black');
      expect(events(io, 'timer:sync').pop().black).toBe(60);
    }
    timer.black = 5;
    s.p1.handlers['game:swap2_choice']({ choice: 'declare', n: 3 });
    expect(timer.black).toBe(60); // then the turn passed to p2
    expect(timer.activeColor).toBe('white');
  });

  test('Taraguchi: each of the 10 offered 5th moves gets a fresh window', () => {
    const timer = perMove();
    const { engine, s } = setup('taraguchi10', timer);
    s.p1.handlers['game:swap2_place']({ x: 7, y: 7 });
    s.p2.handlers['game:swap2_choice']({ choice: 'stay' });
    s.p2.handlers['game:swap2_place']({ x: 7, y: 6 });
    s.p1.handlers['game:swap2_choice']({ choice: 'stay' });
    s.p1.handlers['game:swap2_place']({ x: 7, y: 5 });
    s.p2.handlers['game:swap2_choice']({ choice: 'stay' });
    s.p2.handlers['game:swap2_place']({ x: 8, y: 5 });
    s.p1.handlers['game:swap2_choice']({ choice: 'offer' });
    expect(engine.openingPhase).toBe('rx_offer');
    const cells = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [0, 1], [1, 1], [2, 1]];
    for (const [x, y] of cells.slice(0, 9)) {
      timer.black = 5;
      s.p1.handlers['game:swap2_place']({ x, y });
      expect(s.p1.emitted.filter((e) => e.event === 'game:error')).toEqual([]);
      expect(timer.black).toBe(60);
    }
    expect(engine.offers).toHaveLength(9);
  });

  test('per_game: opening steps do not refill the clock', () => {
    const timer = perMove('per_game');
    const { s } = setup('yamaguchi', timer);
    timer.black = 5;
    s.p1.handlers['game:swap2_place']({ x: 7, y: 7 });
    expect(timer.black).toBe(5);
  });
});

// #430 — a game ending before the opening assigns colours is saved with provisional colours.
describe('mid-opening game end records provisional colours (#430)', () => {
  const database = require('../db/database');
  function endByResign(engineOpts, actions) {
    const io = makeIo();
    const engine = new GameEngine({
      roomId: 'room1', boardSize: 15, walls: [], portals: [], firstMoveZones: [],
      players: [{ userId: 'p1', displayName: 'P1', color: null }, { userId: 'p2', displayName: 'P2', color: null }],
      ...engineOpts,
    });
    const room = { roomId: 'room1', gameState: engine, scoreTable: {}, users: new Map(), state: 'playing' };
    mockRoomManager.getRoomByUser.mockReturnValue(room);
    const s = { p1: makeSocket('p1'), p2: makeSocket('p2') };
    GameHandler.register(io, s.p1);
    GameHandler.register(io, s.p2);
    actions(s);
    expect(engine.colorsAssigned).toBe(false);
    s.p1.handlers['game:resign']();
    return { saved: database.saveGame.mock.calls.pop()[0], room };
  }

  test('Renju Taraguchi: after a swap, p2 holds Black → p2 BLACK, p1 WHITE; game log agrees', () => {
    const { saved, room } = endByResign({ winningRule: 'renju', openingRule: 'taraguchi10' }, (s) => {
      s.p1.handlers['game:swap2_place']({ x: 7, y: 7 });
      s.p2.handlers['game:swap2_choice']({ choice: 'swap' }); // swap → p2 takes over Black
    });
    expect(Object.fromEntries(saved.players.map((p) => [p.id, p.color]))).toEqual({ p1: 'WHITE', p2: 'BLACK' });
    expect(saved.result.winner).toBe('p2');
    expect(room.gameLog.pop().players.map((p) => p.color)).toEqual(['WHITE', 'BLACK']);
  });

  test('Swap2 place3: first player is the provisional Black', () => {
    const { saved } = endByResign({ winningRule: 'freestyle', ruleSwap2: true }, (s) => {
      s.p1.handlers['game:swap2_place']({ x: 7, y: 7 });
    });
    expect(saved.players).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'p1', color: 'BLACK' }),
      expect.objectContaining({ id: 'p2', color: 'WHITE' }),
    ]));
  });
});
