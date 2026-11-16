'use strict';
/** Score table shows the CURRENT pair only: a new opponent (even with one player staying) resets it. */
jest.useFakeTimers();
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../db/database', () => ({ saveGame: jest.fn() }));
jest.mock('../socket/state', () => ({
  timerMap: new Map(), broadcastLobbyUpdate: jest.fn(), scheduleLobbyBoardUpdate: jest.fn(),
  broadcastRoomUpdate: jest.fn(), cleanupRoomTimer: jest.fn(), cleanupReadyTimer: jest.fn(),
}));
jest.mock('../managers/RatingService', () => ({ ...jest.requireActual('../managers/RatingService'), recordGame: jest.fn(() => true) }));
const { handleGameEnd } = require('../socket/handlers/GameHandler');
const io = { to: () => ({ emit: () => {} }) };
const eng = (a, b, winner) => ({
  gameId: 'g', roomId: '#R1', ranked: false, settings: {}, boardSize: 15, walls: [], portals: [], startedAt: Date.now(),
  players: [{ userId: a, displayName: a, color: 'BLACK' }, { userId: b, displayName: b, color: 'WHITE' }],
  moveHistory: [], result: { winner, reason: 'win' },
});
const play = (r, a, b, w) => { r.gameState = eng(a, b, w); handleGameEnd(io, r); };

test('same pair accumulates; new opponent resets, staying player not carried over', () => {
  const r = { roomId: '#R1', users: new Map(), scoreTable: {}, gameLog: [] };
  play(r, 'A', 'B', 'A'); play(r, 'B', 'A', 'A');
  expect(r.scoreTable.A.win).toBe(2);
  play(r, 'A', 'C', 'C');
  expect(Object.keys(r.scoreTable).sort()).toEqual(['A', 'C']);
  expect(r.scoreTable.A).toMatchObject({ win: 0, loss: 1 });
  expect(r.scoreTable.C).toMatchObject({ win: 1, loss: 0 });
});

test('previous pair goes to scoreHistory; returning pair resumes its tally', () => {
  const r = { roomId: '#R1', users: new Map(), scoreTable: {}, gameLog: [] };
  play(r, 'A', 'B', 'A'); play(r, 'A', 'C', 'C');
  expect(r.scoreHistory).toHaveLength(1);
  expect(r.scoreHistory[0].players.find((p) => p.userId === 'A')).toMatchObject({ win: 1, loss: 0 });
  play(r, 'A', 'B', 'B'); // A–B again: resumes 1–0, now 1–1; A–C moves to history
  expect(r.scoreTable.A).toMatchObject({ win: 1, loss: 1 });
  expect(r.scoreHistory.map((h) => h.key)).toEqual(['A|C']);
});
