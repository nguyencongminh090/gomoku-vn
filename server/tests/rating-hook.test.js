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
  return {
    ...actual,
    recordGame: jest.fn((game, onDone) => { onDone(DELTAS); return true; }),
    recordSeries: jest.fn((job, onDone) => { onDone({ ...DELTAS, series: true, swap: null }); return true; }),
  };
});

const database = require('../db/database');
const RatingService = require('../managers/RatingService');
const roomManager = require('../managers/RoomManager');
const ChallengeSeries = require('../managers/ChallengeSeries');
const { handleGameEnd, finishSeries } = require('../socket/handlers/GameHandler');

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
  RatingService.recordSeries.mockClear();
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

describe('handleGameEnd → friend-challenge series (#222)', () => {
  const withSeries = (opts = {}, s = {}) => {
    const room = makeRoom(opts);
    room.series = ChallengeSeries.create({ players: ['u1', 'u2'], total: 3, stake: 'swap', rated: true, category: 'caro', ...s });
    return room;
  };
  const nextGame = (room, gameId, winner) => {
    room.gameState = makeRoom({ winner }).gameState;
    room.gameState.gameId = gameId;
  };
  const seriesEnds = (io) => io.emitted.filter((e) => e.event === 'series:end');

  test('series games are saved but not rated per game; the deciding game rates the whole series once', () => {
    const io = makeIo();
    const room = withSeries();
    handleGameEnd(io, room);
    expect(io.emitted.filter((e) => e.event === 'series:update').map((e) => e.data))
      .toEqual([expect.objectContaining({ total: 3, played: 1, score: { u1: 1, u2: 0 }, done: false })]);
    expect(database.saveGame).toHaveBeenCalledTimes(1);
    expect(RatingService.recordGame).not.toHaveBeenCalled();
    expect(RatingService.recordSeries).not.toHaveBeenCalled();
    expect(room.series.games).toEqual([{ gameId: 'g1', winner: 'u1' }]);

    nextGame(room, 'g2', 'u1');
    handleGameEnd(io, room); // 2-0 in a Bo3 → decided
    expect(RatingService.recordGame).not.toHaveBeenCalled();
    expect(RatingService.recordSeries).toHaveBeenCalledTimes(1);
    expect(RatingService.recordSeries.mock.calls[0][0]).toMatchObject({
      gameIds: ['g1', 'g2'], category: 'caro', winners: ['u1', 'u1'], stake: 'swap', cooldownMs: 24 * 60 * 60 * 1000,
    });
    expect(room.series).toMatchObject({ done: true, winnerId: 'u1', reason: 'complete' });
    expect(seriesEnds(io)).toHaveLength(1);
    expect(seriesEnds(io)[0].data).toMatchObject({ winnerId: 'u1', score: { u1: 2, u2: 0 }, rating: { series: true } });
  });

  test('a game after the series is done is rated normally', () => {
    const io = makeIo();
    const room = withSeries({}, { total: 1 });
    handleGameEnd(io, room);
    expect(RatingService.recordSeries).toHaveBeenCalledTimes(1);
    nextGame(room, 'g2', 'u2');
    handleGameEnd(io, room);
    expect(RatingService.recordGame).toHaveBeenCalledTimes(1);
  });

  test('a friendly series emits series:end without rating', () => {
    const io = makeIo();
    const room = withSeries({ ranked: false }, { total: 1, rated: false, stake: 'none' });
    handleGameEnd(io, room);
    expect(RatingService.recordSeries).not.toHaveBeenCalled();
    expect(seriesEnds(io)[0].data).toMatchObject({ done: true, winnerId: 'u1', rating: null });
  });

  test('a cancelled game (noScore) is not counted', () => {
    const io = makeIo();
    const room = withSeries();
    handleGameEnd(io, room, { noScore: true });
    expect(room.series.games).toEqual([]);
    expect(room.series.done).toBe(false);
  });

  test('a game by someone other than the pair abandons the series first, then rates normally', () => {
    const io = makeIo();
    const room = withSeries();
    room.series.games.push({ gameId: 'g0', winner: 'u2' });
    room.series.players = ['u1', 'u3'];
    room.series.games[0].winner = 'u3';
    handleGameEnd(io, room); // u1 vs u2
    expect(RatingService.recordSeries.mock.calls[0][0]).toMatchObject({ gameIds: ['g0'], winners: ['u3'] });
    expect(room.series).toMatchObject({ done: true, reason: 'abandoned', winnerId: 'u3' });
    expect(RatingService.recordGame).toHaveBeenCalledTimes(1);
  });

  test('finishSeries on leave: rates the games played; tie → no winner; no-op when none is running', () => {
    const io = makeIo();
    const room = withSeries();
    ChallengeSeries.addGame(room.series, 'g1', 'u1');
    ChallengeSeries.addGame(room.series, 'g2', 'u2');
    finishSeries(io, room, 'abandoned');
    expect(room.series).toMatchObject({ done: true, winnerId: null, reason: 'abandoned' });
    expect(RatingService.recordSeries.mock.calls[0][0]).toMatchObject({ gameIds: ['g1', 'g2'] });
    finishSeries(io, room, 'abandoned');
    finishSeries(io, makeRoom(), 'abandoned');
    expect(RatingService.recordSeries).toHaveBeenCalledTimes(1);
  });
});

describe('RoomManager × series (#222)', () => {
  afterEach(() => { for (const id of [...roomManager.userRoomMap.keys()]) roomManager.leaveRoom(id); });

  test('a series player leaving emits series_abandoned (once per player, not for spectators); settings are locked', () => {
    const { room } = roomManager.createRoom({ userId: 'p1', displayName: 'P1', ip: '9.9.9.1' }, {});
    roomManager.joinRoom({ userId: 'p2', displayName: 'P2' }, room.roomId);
    roomManager.joinRoom({ userId: 'spec', displayName: 'S' }, room.roomId);
    room.series = ChallengeSeries.create({ players: ['p1', 'p2'], total: 3, stake: 'none', rated: true, category: 'caro' });
    expect(roomManager.updateSettings('p1', { boardSize: 19 }).code).toBe('SERIES_SETTINGS_LOCKED');
    expect(roomManager.serializeRoom(room).series).toMatchObject({ total: 3, played: 0 });
    const seen = jest.fn();
    roomManager.on('series_abandoned', seen);
    try {
      roomManager.leaveRoom('spec');
      expect(seen).not.toHaveBeenCalled();
      roomManager.leaveRoom('p2');
      expect(seen).toHaveBeenCalledWith(room, 'p2');
      room.series.done = true;
      expect(roomManager.updateSettings('p1', { boardSize: 19 }).error).toBeUndefined();
    } finally { roomManager.off('series_abandoned', seen); }
  });
});
