'use strict';

/**
 * #500 + #501 — replay endpoints return each seat's public player info (username, avatarUrl,
 * rating at game time; null for guests) and the game's winning rule (null for legacy rows).
 * Real schema + migrations on an in-memory DB, real save path (saveGame / saveTournamentGame).
 */

jest.useFakeTimers();

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const gamesRouter = require('../routes/games');
const tournamentGamesRouter = require('../routes/tournamentGames');

const ALICE = 'user-alice-internal';
const BOB = 'user-bob-internal';

function engineGame(gameId, players, extra = {}) {
  return {
    gameId, roomId: '#R1', players, result: { winner: players[0].id, reason: 'normal' },
    boardSize: 15, ruleWall: false, rulePortal: false,
    moveHistory: [{ x: 7, y: 7, color: 'BLACK' }], walls: [], portals: [],
    startedAt: '2026-11-27T10:00:00.000Z', endedAt: '2026-11-27T10:10:00.000Z', ranked: true,
    ...extra,
  };
}

let server;
let baseUrl;

beforeAll(async () => {
  const db = database.db;
  const insUser = db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`);
  insUser.run(ALICE, 'alice', 'Alice A', Date.now());
  insUser.run(BOB, 'bob', 'Bob B', Date.now());
  db.prepare('UPDATE users SET avatar_v = 7 WHERE id = ?').run(ALICE);

  // Rated member vs member, caro rule.
  database.saveGame(engineGame('g-rated', [
    { id: ALICE, name: 'Alice A', color: 'BLACK', isGuest: false },
    { id: BOB, name: 'Bob B', color: 'WHITE', isGuest: false },
  ], { winningRule: 'caro' }));
  db.prepare(`INSERT INTO rating_history (user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after, created_at)
              VALUES (?, 'caro', 'g-rated', ?, 1, 1534.6, 1550, 80, 78, ?)`).run(ALICE, BOB, Date.now());

  // Member vs guest, casual, freestyle.
  database.saveGame(engineGame('g-guest', [
    { id: ALICE, name: 'Alice A', color: 'BLACK', isGuest: false },
    { id: 'guest_x1', name: 'Khách', color: 'WHITE', isGuest: true },
  ], { winningRule: 'freestyle', ranked: false }));

  // Legacy row: saved without a winning rule.
  database.saveGame(engineGame('g-legacy', [
    { id: ALICE, name: 'Alice A', color: 'BLACK', isGuest: false },
    { id: BOB, name: 'Bob B', color: 'WHITE', isGuest: false },
  ]));

  // Tournament game: member (via entry) vs guest entry.
  db.pragma('foreign_keys = OFF');
  database.saveTournamentPlayer({ entryId: 'e-alice', tournamentId: 't1', playerId: ALICE, guestId: null, displayName: 'Alice A', registeredAt: '2026-11-27' });
  database.saveTournamentPlayer({ entryId: 'e-guest', tournamentId: 't1', playerId: null, guestId: 'guest_y2', displayName: 'Khách 2', registeredAt: '2026-11-27' });
  database.saveTournamentGame({
    gameId: 'tg-1', tournamentId: 't1', pairingId: 'p1', gameIndex: 0,
    players: [
      { id: ALICE, name: 'Alice A', color: 'BLACK', isGuest: false, entryId: 'e-alice' },
      { id: 'guest_y2', name: 'Khách 2', color: 'WHITE', isGuest: true, entryId: 'e-guest' },
    ],
    result: { winner: ALICE, reason: 'normal' }, boardSize: 15, ruleWall: false, rulePortal: false,
    moveHistory: [], walls: [], portals: [], startedAt: '2026-11-27T10:00:00.000Z', endedAt: '2026-11-27T10:10:00.000Z',
    winningRule: 'renju',
  });
  db.prepare(`INSERT INTO tournament_games (id, tournament_id, pairing_id, game_index, black_player_name, white_player_name, board_size, moves, started_at, ended_at)
              VALUES ('tg-legacy', 't1', 'p1', 1, 'A', 'B', 15, '[]', '2026-01-01T00:00:00.000Z', '2026-01-01T00:10:00.000Z')`).run();
  db.pragma('foreign_keys = ON');

  const app = express();
  app.use('/api/games', gamesRouter);
  app.use('/api', tournamentGamesRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  database.db.close();
});

async function getGame(path) {
  jest.useRealTimers();
  try {
    const res = await fetch(baseUrl + path);
    return { status: res.status, game: (await res.json()).game };
  } finally { jest.useFakeTimers(); }
}

describe('#501 winning_rule on both replay endpoints', () => {
  test.each([
    ['/api/games/g-rated', 'caro'],
    ['/api/games/g-guest', 'freestyle'],
    ['/api/games/g-legacy', null],
    ['/api/tournament-games/tg-1', 'renju'],
    ['/api/tournament-games/tg-legacy', null],
  ])('%s → %p', async (path, rule) => {
    const { status, game } = await getGame(path);
    expect(status).toBe(200);
    expect(game.winning_rule).toBe(rule);
  });
});

describe('#500 seats on /api/games/:id', () => {
  test('rated member vs member: username, avatar from the shared URL shape, rating at game time', async () => {
    const { game } = await getGame('/api/games/g-rated');
    expect(game.seats.black).toEqual({ username: 'alice', avatarUrl: `/api/profile/avatar/${ALICE}.webp?v=7`, rating: 1535 });
    expect(game.seats.white).toEqual({ username: 'bob', avatarUrl: null, rating: null });
  });

  test('guest seat is null; unrated game has no rating', async () => {
    const { game } = await getGame('/api/games/g-guest');
    expect(game.seats.black).toEqual({ username: 'alice', avatarUrl: `/api/profile/avatar/${ALICE}.webp?v=7`, rating: null });
    expect(game.seats.white).toBeNull();
  });

  test('internal user ids are still not top-level fields', async () => {
    const { game } = await getGame('/api/games/g-rated');
    expect(game).not.toHaveProperty('black_player_id');
    expect(game).not.toHaveProperty('white_player_id');
    expect(JSON.stringify(game.seats)).not.toMatch(/"(userId|id)"/);
  });

  test('a deleted account falls back to null', async () => {
    database.db.pragma('foreign_keys = OFF');
    database.saveGame(engineGame('g-ghost', [
      { id: 'user-gone', name: 'Gone', color: 'BLACK', isGuest: false },
      { id: BOB, name: 'Bob B', color: 'WHITE', isGuest: false },
    ], { winningRule: 'standard' }));
    database.db.pragma('foreign_keys = ON');
    const { game } = await getGame('/api/games/g-ghost');
    expect(game.seats.black).toBeNull();
    expect(game.seats.white.username).toBe('bob');
  });
});

describe('#500 seats on /api/tournament-games/:id', () => {
  test('member entry resolves to the user; guest entry is null', async () => {
    const { game } = await getGame('/api/tournament-games/tg-1');
    expect(game.seats.black).toEqual({ username: 'alice', avatarUrl: `/api/profile/avatar/${ALICE}.webp?v=7`, rating: null });
    expect(game.seats.white).toBeNull();
  });

  test('legacy row without entries: both seats null', async () => {
    const { game } = await getGame('/api/tournament-games/tg-legacy');
    expect(game.seats).toEqual({ black: null, white: null });
  });
});
