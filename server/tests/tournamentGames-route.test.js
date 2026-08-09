'use strict';

/**
 * tournamentGames-route.test.js — Unit tests for pagination on
 * GET /api/tournaments/:tournamentId/games (TODO.md #84 / instruction.md B84).
 *
 * Foreign keys are turned off (same technique as TournamentMatchHandler.test.js)
 * so this file can insert synthetic tournament_games rows directly without
 * needing real tournaments/tournament_pairings/tournament_players fixtures —
 * this suite is only exercising getTournamentGames()/getTournamentGameCount()'s
 * pagination math and the route's page/limit parsing, not referential
 * integrity (already covered elsewhere).
 */

jest.useFakeTimers();

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() {
    return new Actual(':memory:');
  };
});

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const tournamentGamesRouter = require('../routes/tournamentGames');

database.db.pragma('foreign_keys = OFF');

const TOURNAMENT_ID = 't-pagination';
const OTHER_TOURNAMENT_ID = 't-other';

function makeGame(id, tournamentId, index) {
  return {
    id,
    tournament_id: tournamentId,
    pairing_id: 'p1',
    game_index: 0,
    black_entry_id: 'e1',
    white_entry_id: 'e2',
    black_player_name: 'Alice',
    white_player_name: 'Bob',
    winner: 'BLACK',
    reason: 'normal',
    board_size: 15,
    rule_wall: 0,
    rule_portal: 0,
    moves: JSON.stringify([]),
    walls: JSON.stringify([]),
    portals: JSON.stringify([]),
    // Distinct, monotonically increasing timestamps so ORDER BY started_at ASC
    // is deterministic across the fixture.
    started_at: String(1700000000000 + index * 1000),
    ended_at: String(1700000000000 + index * 1000 + 500),
  };
}

let server;
let baseUrl;

beforeAll(async () => {
  const insertGame = database.db.prepare(`
    INSERT INTO tournament_games (id, tournament_id, pairing_id, game_index,
                       black_entry_id, white_entry_id, black_player_name,
                       white_player_name, winner, reason, board_size, rule_wall,
                       rule_portal, moves, walls, portals, started_at, ended_at)
    VALUES (@id, @tournament_id, @pairing_id, @game_index,
            @black_entry_id, @white_entry_id, @black_player_name,
            @white_player_name, @winner, @reason, @board_size, @rule_wall,
            @rule_portal, @moves, @walls, @portals, @started_at, @ended_at)
  `);

  // 25 games in the tournament under test, 2 in an unrelated tournament —
  // the unrelated ones prove the WHERE tournament_id filter (and its count)
  // aren't accidentally global.
  for (let i = 0; i < 25; i++) {
    insertGame.run(makeGame(`g-${i}`, TOURNAMENT_ID, i));
  }
  insertGame.run(makeGame('g-other-1', OTHER_TOURNAMENT_ID, 0));
  insertGame.run(makeGame('g-other-2', OTHER_TOURNAMENT_ID, 1));

  const app = express();
  app.use('/api', tournamentGamesRouter);
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

function get(path) {
  return fetch(`${baseUrl}${path}`);
}

// ── Database layer ──────────────────────────────────────────────────────

describe('database.getTournamentGames / getTournamentGameCount', () => {
  test('with no limit, returns every row (backward-compatible default)', () => {
    const games = database.getTournamentGames(TOURNAMENT_ID);
    expect(games.length).toBe(25);
  });

  test('getTournamentGameCount matches the unpaginated row count', () => {
    expect(database.getTournamentGameCount(TOURNAMENT_ID)).toBe(25);
  });

  test('a limit/offset page returns exactly that slice, in started_at ASC order', () => {
    const page1 = database.getTournamentGames(TOURNAMENT_ID, 10, 0);
    const page2 = database.getTournamentGames(TOURNAMENT_ID, 10, 10);
    const page3 = database.getTournamentGames(TOURNAMENT_ID, 10, 20);

    expect(page1.map(g => g.id)).toEqual(['g-0', 'g-1', 'g-2', 'g-3', 'g-4', 'g-5', 'g-6', 'g-7', 'g-8', 'g-9']);
    expect(page2.map(g => g.id)).toEqual(['g-10', 'g-11', 'g-12', 'g-13', 'g-14', 'g-15', 'g-16', 'g-17', 'g-18', 'g-19']);
    // Last page is a partial page (5 rows, not 10).
    expect(page3.map(g => g.id)).toEqual(['g-20', 'g-21', 'g-22', 'g-23', 'g-24']);
  });

  test('an offset past the end returns an empty array, not an error', () => {
    expect(database.getTournamentGames(TOURNAMENT_ID, 10, 1000)).toEqual([]);
  });

  test('a tournament with no games returns an empty array and a count of 0', () => {
    expect(database.getTournamentGames('t-no-games')).toEqual([]);
    expect(database.getTournamentGameCount('t-no-games')).toBe(0);
  });
});

// ── Route layer ──────────────────────────────────────────────────────────

describe('GET /api/tournaments/:tournamentId/games', () => {
  test('defaults to page 1, limit 20 when no query params are given', async () => {
    const res = await get(`/api/tournaments/${TOURNAMENT_ID}/games`);
    expect(res.status).toBe(200);

    const { games, pagination } = await res.json();
    expect(games.length).toBe(20);
    expect(pagination).toEqual({ page: 1, limit: 20, total: 25, totalPages: 2 });
  });

  test('returns the second (partial) page', async () => {
    const res = await get(`/api/tournaments/${TOURNAMENT_ID}/games?page=2&limit=20`);
    const { games, pagination } = await res.json();

    expect(games.length).toBe(5);
    expect(pagination).toEqual({ page: 2, limit: 20, total: 25, totalPages: 2 });
  });

  test('a custom limit is honored', async () => {
    const res = await get(`/api/tournaments/${TOURNAMENT_ID}/games?page=1&limit=5`);
    const { games, pagination } = await res.json();

    expect(games.map(g => g.id)).toEqual(['g-0', 'g-1', 'g-2', 'g-3', 'g-4']);
    expect(pagination).toEqual({ page: 1, limit: 5, total: 25, totalPages: 5 });
  });

  test('limit is capped at 50, mirroring routes/games.js', async () => {
    const res = await get(`/api/tournaments/${TOURNAMENT_ID}/games?limit=500`);
    const { pagination } = await res.json();
    expect(pagination.limit).toBe(50);
  });

  test('a page beyond totalPages returns an empty list, not an error', async () => {
    const res = await get(`/api/tournaments/${TOURNAMENT_ID}/games?page=99&limit=20`);
    expect(res.status).toBe(200);
    const { games, pagination } = await res.json();
    expect(games).toEqual([]);
    expect(pagination.page).toBe(99);
  });

  test('malformed page/limit query params fall back to the defaults rather than erroring', async () => {
    const res = await get(`/api/tournaments/${TOURNAMENT_ID}/games?page=abc&limit=xyz`);
    expect(res.status).toBe(200);
    const { pagination } = await res.json();
    expect(pagination).toEqual({ page: 1, limit: 20, total: 25, totalPages: 2 });
  });

  test('a negative page is clamped to 1; a zero limit falls back to the default (mirrors routes/games.js: 0 is falsy)', async () => {
    const res = await get(`/api/tournaments/${TOURNAMENT_ID}/games?page=-5&limit=0`);
    expect(res.status).toBe(200);
    const { pagination } = await res.json();
    expect(pagination.page).toBe(1);
    expect(pagination.limit).toBe(20);
  });

  test('a negative limit is clamped to 1', async () => {
    const res = await get(`/api/tournaments/${TOURNAMENT_ID}/games?limit=-5`);
    expect(res.status).toBe(200);
    const { pagination } = await res.json();
    expect(pagination.limit).toBe(1);
  });

  test('results are scoped to the requested tournament only', async () => {
    const res = await get(`/api/tournaments/${OTHER_TOURNAMENT_ID}/games`);
    const { games, pagination } = await res.json();

    expect(games.map(g => g.id).sort()).toEqual(['g-other-1', 'g-other-2']);
    expect(pagination.total).toBe(2);
  });

  test('an unknown tournament id returns an empty page, not an error', async () => {
    const res = await get('/api/tournaments/does-not-exist/games');
    expect(res.status).toBe(200);
    const { games, pagination } = await res.json();
    expect(games).toEqual([]);
    expect(pagination.total).toBe(0);
  });
});
