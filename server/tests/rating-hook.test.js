'use strict';

/**
 * rating-hook.test.js — game end → rating hook in GameHandler.handleGameEnd,
 * and the room's Ranked toggle default (TODO.md #175).
 *
 * RatingService.recordGame is replaced by a stub that "flushes" immediately,
 * so the test sees what the hook passes and what it emits; the real
 * isRatedGame is kept, because the hook's decision is what's under test.
 * The queue/DB side is covered by RatingService.test.js.
 */

jest.useFakeTimers();

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../db/database', () => ({ saveGame: jest.fn() }));

const mockState = {
  timerMap: new Map(),
  broadcastLobbyUpdate: jest.fn(),
  broadcastRoomUpdate: jest.fn(),
  cleanupRoomTimer: jest.fn(),
  cleanupReadyTimer: jest.fn(),
};
jest.mock('../socket/state', () => mockState);

const DELTAS = { gameId: 'g1', category: 'caro', players: [] };
jest.mock('../managers/RatingService', () => {
  const actual = jest.requireActual('../managers/RatingService');
  return { ...actual, recordGame: jest.fn((game, onDone) => { onDone(DELTAS); return true; }) };
});

const database = require('../db/database');
const RatingService = require('../managers/RatingService');
const roomManager = require('../managers/RoomManager');
const { handleGameEnd } = require('../socket/handlers/GameHandler');

function makeIo() {
  const emitted = [];
  return {
    emitted,
    to: jest.fn((room) => ({ emit: (event, data) => emitted.push({ room, event, data }) })),
  };
}

function makeRoom({ ranked = true, winningRule = 'caro', guest = false, winner = 'u1', walls = [] } = {}) {
  return {
    roomId: '#R1',
    users: new Map(),
    scoreTable: {},
    gameState: {
      gameId: 'g1',
      roomId: '#R1',
      ranked,
      settings: { winningRule },
      players: [
        { userId: 'u1', displayName: 'One', color: 'BLACK', isGuest: false },
        { userId: guest ? 'guest_x' : 'u2', displayName: 'Two', color: 'WHITE', isGuest: guest },
      ],
      result: winner ? { winner, reason: 'normal' } : null,
      boardSize: 15,
      walls,
      portals: [],
      moveHistory: [],
    },
  };
}

const ratingEmits = (io) => io.emitted.filter((e) => e.event === 'rating:update');

beforeEach(() => {
  database.saveGame.mockReset();
  RatingService.recordGame.mockClear();
});

describe('handleGameEnd → rating hook', () => {
  test('ranked game between members: saved as ranked, queued in its winning-rule pool, deltas emitted to the room', () => {
    const io = makeIo();
    handleGameEnd(io, makeRoom());

    expect(database.saveGame).toHaveBeenCalledWith(expect.objectContaining({ ranked: true }));
    expect(RatingService.recordGame).toHaveBeenCalledWith(
      expect.objectContaining({ gameId: 'g1', winningRule: 'caro', result: { winner: 'u1', reason: 'normal' } }),
      expect.any(Function)
    );
    expect(ratingEmits(io)).toEqual([{ room: '#R1', event: 'rating:update', data: DELTAS }]);
  });

  test('wall game is still rated (no special-board exclusion)', () => {
    const io = makeIo();
    handleGameEnd(io, makeRoom({ walls: [{ x: 1, y: 1 }] }));
    expect(RatingService.recordGame).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['casual room',          { ranked: false }],
    ['guest opponent',       { guest: true }],
  ])('%s: saved with ranked=false, no rating, no emit', (_l, opts) => {
    const io = makeIo();
    handleGameEnd(io, makeRoom(opts));
    expect(database.saveGame).toHaveBeenCalledWith(expect.objectContaining({ ranked: false }));
    expect(RatingService.recordGame).not.toHaveBeenCalled();
    expect(ratingEmits(io)).toHaveLength(0);
  });

  test('noScore (cancelled) game: neither saved nor rated', () => {
    const io = makeIo();
    handleGameEnd(io, makeRoom(), { noScore: true });
    expect(database.saveGame).not.toHaveBeenCalled();
    expect(RatingService.recordGame).not.toHaveBeenCalled();
  });

  test('game row failed to persist: not rated (no history row pointing at a missing game)', () => {
    database.saveGame.mockImplementation(() => { throw new Error('disk full'); });
    const io = makeIo();
    handleGameEnd(io, makeRoom());
    expect(RatingService.recordGame).not.toHaveBeenCalled();
  });
});

describe('room settings — Ranked toggle', () => {
  test.each([
    [{}, true],
    [{ ranked: true }, true],
    [{ ranked: false }, false],
    [{ ranked: 'no' }, true],
  ])('%p → ranked %p', (input, expected) => {
    expect(roomManager._validateSettings(input).ranked).toBe(expected);
  });
});
