'use strict';

/**
 * cheat-reports.test.js — member cheat reports + staff queue (R8 #208). Real SQL, in-memory DB.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
// The per-IP HTTP limiters would trip on this suite's many calls; the per-user daily cap is tested for real.
jest.mock('express-rate-limit', () => {
  const passthrough = () => (req, res, next) => next();
  passthrough.ipKeyGenerator = (ip) => ip;
  return passthrough;
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../middleware/auth', () => ({
  verifyToken: (req, res, next) => {
    if (!req.headers.cookie) return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = { userId: req.headers.cookie === 'guest' ? null : req.headers.cookie };
    next();
  },
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const adminRouter = require('../routes/admin');
const gamesRouter = require('../routes/games');

const db = database.db;
let server, base;
const NOW = '2026-10-10T00:00:00.000Z';

function add(id, role = 'member') {
  db.prepare("INSERT INTO users (id, username, password_hash, display_name, created_at, role) VALUES (?, ?, 'x', ?, ?, ?)").run(id, id, id.toUpperCase(), NOW, role);
}
function game(id, black, white, ended = NOW) {
  db.prepare(`INSERT INTO games (id, room_id, black_player_id, white_player_id, black_player_name, white_player_name, winner, reason, board_size, started_at, ended_at)
    VALUES (?, 'r', ?, ?, 'BN', 'WN', 'BLACK', 'normal', 15, ?, ?)`).run(id, black, white, NOW, ended);
}
async function call(method, p, as, body) {
  const headers = {};
  if (as) headers.cookie = as;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
const rep = (id, as, body) => call('POST', `/api/games/${id}/report`, as, body);
const rows = () => db.prepare('SELECT * FROM game_reports ORDER BY created_at, id').all();
const edges = () => db.prepare('SELECT * FROM admin_edges').all();

beforeAll(async () => {
  ['alice', 'bob', 'carol', 'dave'].forEach((n) => add(n));
  add('mod', 'moderator'); add('boss', 'admin');
  const app = express();
  app.use('/api/games', gamesRouter);
  app.use('/api/admin', adminRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
beforeEach(() => {
  db.prepare('DELETE FROM game_reports').run();
  db.prepare('DELETE FROM admin_edges').run();
  db.prepare('DELETE FROM games').run();
  game('g1', 'alice', 'bob');
});

describe('POST /api/games/:id/report', () => {
  it('stores a report for the seat\'s user', async () => {
    const r = await rep('g1', 'carol', { side: 'WHITE', reason: 'engine-like moves' });
    expect(r.status).toBe(200);
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ game_id: 'g1', reporter_id: 'carol', accused_id: 'bob', reason: 'engine-like moves' });
  });
  it('a repeat is a no-op', async () => {
    await rep('g1', 'carol', { side: 'WHITE', reason: 'x' });
    expect((await rep('g1', 'carol', { side: 'WHITE', reason: 'again' })).status).toBe(200);
    expect(rows()).toHaveLength(1);
  });
  it.each([
    ['guest', 'WHITE', 'x', 403, 'GUEST_FORBIDDEN'],
    ['carol', 'RED', 'x', 400, 'CHEAT_SIDE_INVALID'],
    ['carol', 'WHITE', '', 400, 'CHEAT_REASON_INVALID'],
    ['carol', 'WHITE', '   ', 400, 'CHEAT_REASON_INVALID'],
    ['carol', 'WHITE', 'x'.repeat(201), 400, 'CHEAT_REASON_INVALID'],
    ['bob', 'WHITE', 'x', 400, 'CHEAT_SELF'],
  ])('%s side=%s reason=%j → %i %s', async (as, side, reason, status, code) => {
    const r = await rep('g1', as, { side, reason });
    expect([r.status, r.body.code]).toEqual([status, code]);
    expect(rows()).toHaveLength(0);
  });
  it('anonymous 401; unknown game 404; unfinished game 400; guest seat 400', async () => {
    expect((await rep('g1', undefined, { side: 'WHITE', reason: 'x' })).status).toBe(401);
    expect((await rep('nope', 'carol', { side: 'WHITE', reason: 'x' })).status).toBe(404);
    game('open', 'alice', 'bob', null);
    expect((await rep('open', 'carol', { side: 'WHITE', reason: 'x' })).body.code).toBe('CHEAT_GAME_NOT_FINISHED');
    game('gg', 'alice', null);
    expect((await rep('gg', 'carol', { side: 'WHITE', reason: 'x' })).body.code).toBe('CHEAT_TARGET_GUEST');
  });
  it('control characters are stripped from the reason', async () => {
    await rep('g1', 'carol', { side: 'BLACK', reason: 'a\nb\u0000c' });
    expect(rows()[0].reason).toBe('a b c');
  });
  it('11th report in 24 h is rejected', async () => {
    for (let i = 0; i < 10; i++) { game('x' + i, 'alice', 'bob'); expect((await rep('x' + i, 'carol', { side: 'WHITE', reason: 'r' })).status).toBe(200); }
    const r = await rep('g1', 'carol', { side: 'WHITE', reason: 'r' });
    expect([r.status, r.body.code]).toEqual([429, 'CHEAT_RATE_LIMITED']);
  });
});

describe('staff queue', () => {
  const open = async (as = 'mod') => call('GET', '/api/admin/cheat-reports', as);

  it.each([['carol', 403], ['guest', 403], ['mod', 200], ['boss', 200]])('%s → queue %i', async (as, status) => {
    expect((await open(as)).status).toBe(status);
  });
  it('lists game summary, accused history, and hides reporter ids', async () => {
    await rep('g1', 'carol', { side: 'WHITE', reason: 'r1' });
    await rep('g1', 'dave', { side: 'WHITE', reason: 'r2' });
    const r = await open();
    expect(r.body.reports).toHaveLength(2);
    expect(r.body.reports[0]).toMatchObject({ accused: { id: 'bob', displayName: 'BOB' }, game: { id: 'g1', accusedSide: 'WHITE', black: 'BN' }, accusedOpenGames: 1, accusedConfirmedGames: 0 });
    expect(JSON.stringify(r.body)).not.toContain('reporter_id');
    expect(r.body.reports[0].reporter).toEqual({ displayName: 'CAROL' });
  });
  it('dismiss closes every open report on that game+accused and logs no edge', async () => {
    await rep('g1', 'carol', { side: 'WHITE', reason: 'r1' });
    await rep('g1', 'dave', { side: 'WHITE', reason: 'r2' });
    const id = (await open()).body.reports[0].id;
    expect((await call('POST', `/api/admin/cheat-reports/${id}/resolve`, 'mod', { confirm: false })).body).toEqual({ ok: true, resolution: 'dismissed' });
    expect((await open()).body.reports).toHaveLength(0);
    expect(edges()).toHaveLength(0);
  });
  it('confirm logs a cheat_confirm edge staff → accused and counts in the accused history', async () => {
    await rep('g1', 'carol', { side: 'WHITE', reason: 'r1' });
    const id = (await open()).body.reports[0].id;
    await call('POST', `/api/admin/cheat-reports/${id}/resolve`, 'mod', { confirm: true });
    const [e] = edges();
    expect(e).toMatchObject({ actor_id: 'mod', target_id: 'bob', action: 'cheat_confirm' });
    expect(JSON.parse(e.detail)).toEqual({ gameId: 'g1' });
    game('g2', 'alice', 'bob');
    await rep('g2', 'carol', { side: 'WHITE', reason: 'r' });
    expect((await open()).body.reports[0].accusedConfirmedGames).toBe(1);
  });
  it('confirm must be exactly true; closed → 409; unknown → 404; non-staff 403', async () => {
    await rep('g1', 'carol', { side: 'WHITE', reason: 'r1' });
    const id = (await open()).body.reports[0].id;
    expect((await call('POST', `/api/admin/cheat-reports/${id}/resolve`, 'carol', { confirm: true })).status).toBe(403);
    await call('POST', `/api/admin/cheat-reports/${id}/resolve`, 'mod', { confirm: 'true' });
    expect(edges()).toHaveLength(0);
    expect((await call('POST', `/api/admin/cheat-reports/${id}/resolve`, 'mod', { confirm: true })).status).toBe(409);
    expect((await call('POST', '/api/admin/cheat-reports/nope/resolve', 'mod', {})).status).toBe(404);
  });
  it('a deleted accused shows as (đã xoá)', async () => {
    await rep('g1', 'carol', { side: 'WHITE', reason: 'r1' });
    db.prepare('DELETE FROM games').run(); // games.white_player_id has an FK to users
    db.prepare("DELETE FROM users WHERE id = 'bob'").run();
    const r = (await open()).body.reports[0];
    expect(r.accused.displayName).toBe('(đã xoá)');
    expect(r.game).toBeNull();
    add('bob');
  });
});
