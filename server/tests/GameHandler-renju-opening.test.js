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
const { GameEngine } = require('../managers/GameEngine');

function makeIo() {
  const io = { emitted: [], to: jest.fn(() => ({ emit: (event, data) => io.emitted.push({ event, data }) })) };
  return io;
}
function makeSocket(userId) {
  const handlers = {};
  return { user: { userId, displayName: userId }, handlers, emitted: [], on: (e, cb) => { handlers[e] = cb; }, emit(event, data) { this.emitted.push({ event, data }); } };
}
function setup(openingRule) {
  const io = makeIo();
  const engine = new GameEngine({
    roomId: 'room1', boardSize: 15, walls: [], portals: [], firstMoveZones: [], winningRule: 'renju', openingRule,
    players: [{ userId: 'p1', displayName: 'p1', color: null }, { userId: 'p2', displayName: 'p2', color: null }],
  });
  const room = { roomId: 'room1', gameState: engine };
  mockRoomManager.getRoomByUser.mockReturnValue(room);
  const timer = { switchTurn: jest.fn(), remapForSwap2: jest.fn(), getSync: jest.fn(() => ({})) };
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
