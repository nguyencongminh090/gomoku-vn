'use strict';

/**
 * friendly-only-requests.test.js — TODO.md #216.
 *
 * Undo and extra time exist only in "Giao hữu" (friendly) games: a game that
 * will not change ratings. The server refuses both requests in a rated game
 * with FRIENDLY_ONLY (hiding the buttons is not enough — the socket events stay
 * callable). "Rated" is the effective rule (RatingService.isRatedSetup): a
 * ranked room with a guest seated is friendly, because it can't be rated.
 */

const mockRoomManager = {
  getRoomByUser: jest.fn(),
  serializeRoom: jest.fn((room) => ({ roomId: room.roomId, users: [] })),
};
jest.mock('../managers/RoomManager', () => mockRoomManager);
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../db/database', () => ({ saveGame: jest.fn() }));

const mockState = {
  timerMap: new Map(),
  broadcastLobbyUpdate: jest.fn(),
  broadcastRoomUpdate: jest.fn(),
  cleanupRoomTimer: jest.fn(),
  cleanupReadyTimer: jest.fn(),
  buildRoomStatePayload: jest.fn((room) => ({ roomId: room.roomId })),
};
jest.mock('../socket/state', () => mockState);

const { GameEngine } = require('../managers/GameEngine');
const GameHandler = require('../socket/handlers/GameHandler');
const { isRatedSetup } = require('../managers/RatingService');

function makeIo() {
  const emitted = [];
  return { emitted, to: jest.fn(() => ({ emit: (event, data) => emitted.push({ event, data }) })) };
}

function makeSocket(userId) {
  const handlers = {};
  return {
    user: { userId, displayName: userId },
    handlers,
    emitted: [],
    on: jest.fn((event, cb) => { handlers[event] = cb; }),
    emit: jest.fn(function (event, data) { this.emitted.push({ event, data }); }),
  };
}

function setup({ ranked, guest = false, winningRule = 'freestyle' }) {
  const engine = new GameEngine({
    roomId: '#R1',
    boardSize: 15,
    winningRule,
    players: [
      { userId: 'u1', displayName: 'One', color: 'BLACK', isGuest: false },
      { userId: guest ? 'guest_2' : 'u2', displayName: 'Two', color: 'WHITE', isGuest: guest },
    ],
  });
  engine.ranked = ranked;
  engine.makeMove('u1', 7, 7); // one stone so an undo has something to take back
  const room = { roomId: '#R1', users: new Map(), gameState: engine, _timeRequestsUsed: {}, _timeRequestPending: null };
  mockRoomManager.getRoomByUser.mockReturnValue(room);
  const io = makeIo();
  const sockets = { u1: makeSocket('u1'), u2: makeSocket(guest ? 'guest_2' : 'u2') };
  GameHandler.register(io, sockets.u1);
  GameHandler.register(io, sockets.u2);
  return { engine, io, sockets };
}

const codesOf = (socket) => socket.emitted.filter(e => e.event === 'game:error').map(e => e.data.code);

afterEach(() => { mockState.timerMap.clear(); jest.clearAllMocks(); });

describe('isRatedSetup — decision table', () => {
  const two = [{ id: 'a' }, { id: 'b' }];
  test.each([
    ['ranked, two members, rated rule', { ranked: true, winningRule: 'caro', players: two }, true],
    ['room not ranked', { ranked: false, winningRule: 'caro', players: two }, false],
    ['ranked flag missing', { winningRule: 'caro', players: two }, false],
    ['a guest seated', { ranked: true, winningRule: 'caro', players: [{ id: 'a' }, { id: 'g', isGuest: true }] }, false],
    ['unknown rule', { ranked: true, winningRule: 'renju', players: two }, false],
    ['same player twice', { ranked: true, winningRule: 'caro', players: [{ id: 'a' }, { id: 'a' }] }, false],
    ['one player', { ranked: true, winningRule: 'caro', players: [{ id: 'a' }] }, false],
    ['null', null, false],
  ])('%s', (_name, game, expected) => {
    expect(isRatedSetup(game)).toBe(expected);
  });
});

describe('game:undo_request', () => {
  test('rated game: refused with FRIENDLY_ONLY, no offer made', () => {
    const { engine, io, sockets } = setup({ ranked: true });
    sockets.u1.handlers['game:undo_request']();
    expect(codesOf(sockets.u1)).toEqual(['FRIENDLY_ONLY']);
    expect(engine.undoOffer).toBeNull();
    expect(io.emitted.some(e => e.event === 'game:undo_offered')).toBe(false);
  });

  test.each([
    ['room not ranked', { ranked: false }],
    ['ranked room with a guest seated', { ranked: true, guest: true }],
  ])('friendly (%s): offer goes out', (_name, opts) => {
    const { engine, io, sockets } = setup(opts);
    sockets.u1.handlers['game:undo_request']();
    expect(codesOf(sockets.u1)).toEqual([]);
    expect(engine.undoOffer).not.toBeNull();
    expect(io.emitted.some(e => e.event === 'game:undo_offered')).toBe(true);
  });
});

describe('game:request_time', () => {
  // After u1's opening stone it is u2's turn; time can only be asked on your own turn.
  test('rated game: refused with FRIENDLY_ONLY before any quota is spent', () => {
    const { sockets } = setup({ ranked: true });
    sockets.u2.handlers['game:request_time']();
    expect(codesOf(sockets.u2)).toEqual(['FRIENDLY_ONLY']);
  });

  test('friendly game: not refused as FRIENDLY_ONLY', () => {
    const { sockets } = setup({ ranked: false });
    sockets.u2.handlers['game:request_time']();
    expect(codesOf(sockets.u2)).not.toContain('FRIENDLY_ONLY');
  });
});

describe('serialize() exposes rated for the client', () => {
  test.each([[true, true], [false, false]])('ranked=%s → rated=%s', (ranked, rated) => {
    const { engine } = setup({ ranked });
    expect(engine.serialize().rated).toBe(rated);
  });
});
