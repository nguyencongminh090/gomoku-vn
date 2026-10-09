'use strict';

/**
 * games-rate-limit-ip.test.js — gamesLimiter / tournamentGamesLimiter
 * keyGenerator (TODO.md #93). Same bug and pattern as auth-rate-limit-ip.test.js (#92):
 * without a keyGenerator every visitor behind the Cloudflare Tunnel shares one budget.
 */

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../db/database', () => ({
  getGamesByUser: jest.fn(() => []),
  getRecentGames: jest.fn(() => []),
  getGameById: jest.fn(() => null),
  getGameStats: jest.fn(() => ({})),
  getTournamentGames: jest.fn(() => []),
}), { virtual: false });

const express = require('express');
const http = require('http');

let server, baseUrl;

beforeAll(async () => {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use('/api/games', require('../routes/games'));
  app.use('/api', require('../routes/tournamentGames'));
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
});

const get = (path, ip) => fetch(baseUrl + path, { headers: { 'cf-connecting-ip': ip } });

test.each([
  ['gamesLimiter', '/api/games/zzz'],
  ['tournamentGamesLimiter', '/api/tournament-games/zzz'],
])('%s: a second client IP keeps its own budget after the first is exhausted', async (_n, path) => {
  for (let i = 0; i < 300; i += 1) {
    const res = await get(path, '203.0.113.9');
    expect(res.status).not.toBe(429);
  }
  expect((await get(path, '203.0.113.9')).status).toBe(429);
  expect((await get(path, '198.51.100.20')).status).not.toBe(429);
}, 30000);
