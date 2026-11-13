'use strict';

/**
 * #368 — per-room game log for the phone "Tỉ số" tab (mockup C: big score, result dots, one row per game).
 * handleGameEnd appends { n, winnerId, reason, moves, durationMs, players } for every scored game; cancelled
 * (noScore) games are not logged; the log is capped; serializeRoom ships it and room:updated sends it only
 * when it changed (same diffing as scoreTable).
 */

jest.useFakeTimers();
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
jest.mock('../managers/RatingService', () => ({ ...jest.requireActual('../managers/RatingService'), recordGame: jest.fn(() => true) }));

const roomManager = require('../managers/RoomManager');
const { handleGameEnd, GAME_LOG_MAX } = require('../socket/handlers/GameHandler');

const io = { to: () => ({ emit: () => {} }) };

function room(extra = {}) {
  return { roomId: '#R1', users: new Map(), scoreTable: {}, gameLog: [], ...extra };
}
function engine(winner, { moves = 3, startedAt = Date.now() - 65000, reason = 'win' } = {}) {
  return {
    gameId: 'g', roomId: '#R1', ranked: false, settings: { winningRule: 'caro' }, boardSize: 15, walls: [], portals: [],
    startedAt,
    players: [
      { userId: 'u1', displayName: 'Minh', color: 'BLACK', isGuest: false },
      { userId: 'u2', displayName: 'Long', color: 'WHITE', isGuest: false },
    ],
    moveHistory: Array.from({ length: moves }, (_, i) => ({ x: i, y: 0 })),
    result: winner ? { winner, reason } : null,
  };
}

test('a finished game is appended with winner, reason, move count, duration and both players', () => {
  const r = room();
  r.gameState = engine('u1', { moves: 41, startedAt: Date.now() - 492000 });
  handleGameEnd(io, r);
  expect(r.gameLog).toEqual([{
    n: 1, winnerId: 'u1', reason: 'win', moves: 41, durationMs: 492000,
    players: [{ userId: 'u1', name: 'Minh', color: 'BLACK' }, { userId: 'u2', name: 'Long', color: 'WHITE' }],
  }]);
});

test('numbering continues; draws log winnerId "draw"', () => {
  const r = room();
  r.gameState = engine('u2'); handleGameEnd(io, r);
  r.gameState = engine('draw', { reason: 'agreement' }); handleGameEnd(io, r);
  expect(r.gameLog.map((g) => [g.n, g.winnerId, g.reason])).toEqual([[1, 'u2', 'win'], [2, 'draw', 'agreement']]);
});

test('cancelled (noScore) and result-less games are not logged', () => {
  const r = room();
  r.gameState = engine('u1'); handleGameEnd(io, r, { noScore: true });
  r.gameState = engine(null); handleGameEnd(io, r);
  expect(r.gameLog).toEqual([]);
});

test('a room object without a log (older shape) gets one', () => {
  const r = room({ gameLog: undefined });
  r.gameState = engine('u1'); handleGameEnd(io, r);
  expect(r.gameLog).toHaveLength(1);
});

test('missing startedAt → durationMs null, never NaN', () => {
  const r = room();
  r.gameState = engine('u1'); delete r.gameState.startedAt; handleGameEnd(io, r);
  expect(r.gameLog[0].durationMs).toBeNull();
});

test(`capped at GAME_LOG_MAX (${30}), oldest dropped, numbering keeps counting`, () => {
  expect(GAME_LOG_MAX).toBe(30);
  const r = room();
  for (let i = 0; i < GAME_LOG_MAX + 2; i++) { r.gameState = engine('u1'); handleGameEnd(io, r); }
  expect(r.gameLog).toHaveLength(GAME_LOG_MAX);
  expect(r.gameLog[0].n).toBe(3);
  expect(r.gameLog[GAME_LOG_MAX - 1].n).toBe(GAME_LOG_MAX + 2);
});

test('new rooms start with an empty log and serializeRoom ships a copy', () => {
  const { room: real } = roomManager.createRoom({ userId: 'h1', displayName: 'H', isGuest: true, ip: '9.9.9.9' });
  expect(real.gameLog).toEqual([]);
  real.gameLog.push({ n: 1 });
  const out = roomManager.serializeRoom(real);
  expect(out.gameLog).toEqual([{ n: 1 }]);
  expect(out.gameLog).not.toBe(real.gameLog);
  roomManager._destroyRoom(real.roomId);
});
