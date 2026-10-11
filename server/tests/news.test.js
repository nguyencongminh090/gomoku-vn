'use strict';

/**
 * news.test.js — admin dashboard news (#224): admin-only CRUD on /api/admin/news, and the DB-backed
 * /api/home blocks (news, top-3 forum, learn, newcomer). Real SQL, in-memory DB.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
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
jest.mock('../managers/RoomManager', () => ({ rooms: new Map(), getRoomByUser: () => null }));
jest.mock('../managers/tournament/TournamentManager', () => ({ pairings: new Map(), listTournaments: () => [], getTournament: () => null }));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const adminRouter = require('../routes/admin');
const { buildHome } = require('../routes/home');

const db = database.db;
let server, base;
const NOW = '2026-10-10T00:00:00.000Z';

function add(id, role = 'member') {
  db.prepare("INSERT INTO users (id, username, password_hash, display_name, created_at, role) VALUES (?, ?, 'x', ?, ?, ?)").run(id, id, id.toUpperCase(), NOW, role);
}
async function call(method, p, as, body) {
  const headers = {};
  if (as) headers.cookie = as;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
const home = (user) => buildHome(user, undefined, undefined, () => ({}), () => ({}), () => 0);
const ME = (id) => ({ userId: id, isGuest: false });

beforeAll(async () => {
  add('alice'); add('mod', 'moderator'); add('boss', 'admin');
  const app = express();
  app.use('/api/admin', adminRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
beforeEach(() => {
  db.prepare('DELETE FROM news').run();
});

describe('admin news — auth (server-side role check only)', () => {
  it.each([
    ['GET', '/api/admin/news', undefined],
    ['POST', '/api/admin/news', { body: 'x' }],
    ['PUT', '/api/admin/news/n1', { body: 'x' }],
    ['DELETE', '/api/admin/news/n1', undefined],
  ])('%s %s: 401 signed out, 403 guest / member / moderator', async (method, p, body) => {
    expect((await call(method, p, null, body)).status).toBe(401);
    expect((await call(method, p, 'guest', body)).status).toBe(403);
    expect((await call(method, p, 'alice', body)).body.code).toBe('NEWS_FORBIDDEN');
    const mod = await call(method, p, 'mod', body);
    expect(mod.status).toBe(403);
    expect(mod.body.code).toBe('NEWS_FORBIDDEN');
  });

  it('a body flag like isAdmin:true does not grant anything', async () => {
    expect((await call('POST', '/api/admin/news', 'alice', { body: 'x', isAdmin: true, role: 'admin' })).status).toBe(403);
    expect(db.prepare('SELECT COUNT(*) AS n FROM news').get().n).toBe(0);
  });
});

describe('admin news — CRUD', () => {
  it('create → list newest first → edit → delete', async () => {
    const a = await call('POST', '/api/admin/news', 'boss', { body: 'Giải mùa thu mở đăng ký' });
    expect(a.status).toBe(201);
    expect(a.body.item).toMatchObject({ body: 'Giải mùa thu mở đăng ký', link: null });
    db.prepare('UPDATE news SET created_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', a.body.item.id);
    const b = await call('POST', '/api/admin/news', 'boss', { body: 'Bảo trì 22h', link: '/forum/t/abc' });
    expect((await call('GET', '/api/admin/news', 'boss')).body.items.map((x) => x.id)).toEqual([b.body.item.id, a.body.item.id]);

    const e = await call('PUT', `/api/admin/news/${a.body.item.id}`, 'boss', { body: 'Đã sửa', link: '' });
    expect(e.body.item).toMatchObject({ id: a.body.item.id, body: 'Đã sửa', link: null });
    expect(e.body.item.updatedAt >= e.body.item.createdAt).toBe(true);

    expect((await call('DELETE', `/api/admin/news/${b.body.item.id}`, 'boss')).body).toEqual({ ok: true });
    expect((await call('DELETE', `/api/admin/news/${b.body.item.id}`, 'boss')).status).toBe(404);
    expect((await call('PUT', '/api/admin/news/nope', 'boss', { body: 'x' })).status).toBe(404);
  });

  it('body: one line, 1–200 chars after cleaning; HTML kept as literal text (rendered with textContent)', async () => {
    const ok = await call('POST', '/api/admin/news', 'boss', { body: '  <b>Hi</b>\n\tthere\u0007 ' });
    expect(ok.body.item.body).toBe('<b>Hi</b> there');
    for (const body of ['', '   ', '\n\n', 'x'.repeat(201), 42, undefined]) {
      const r = await call('POST', '/api/admin/news', 'boss', { body });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('NEWS_BODY_INVALID');
    }
    expect((await call('POST', '/api/admin/news', 'boss', { body: 'x'.repeat(200) })).status).toBe(201);
  });

  it.each([
    ['https://evil.example', 400], ['//evil.example', 400], ['/\\evil.example', 400], ['javascript:alert(1)', 400],
    ['/forum x', 400], ['forum', 400], ['/' + 'a'.repeat(200), 400],
    ['/forum', 201], ['/tournament?id=1', 201], [null, 201], ['', 201],
  ])('link %p → %i', async (link, status) => {
    const r = await call('POST', '/api/admin/news', 'boss', { body: 'x', link });
    expect(r.status).toBe(status);
    if (status === 400) expect(r.body.code).toBe('NEWS_LINK_INVALID');
  });
});

describe('/api/home content blocks', () => {
  it('news = newest item only, or null', async () => {
    expect(home(null).news).toBeNull();
    const a = await call('POST', '/api/admin/news', 'boss', { body: 'old' });
    db.prepare('UPDATE news SET created_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', a.body.item.id);
    await call('POST', '/api/admin/news', 'boss', { body: 'new', link: '/forum' });
    expect(home(null).news).toMatchObject({ body: 'new', link: '/forum' });
  });

  it('forum = 3 most recently active non-deleted threads, titles only (no body, no author id)', () => {
    const ins = db.prepare("INSERT INTO forum_threads (id, category, author_id, title, body, created_at, last_post_at, deleted) VALUES (?, 'general', 'alice', ?, 'secret body', ?, ?, ?)");
    ins.run('t1', 'One', NOW, '2026-10-01T00:00:00.000Z', 0);
    ins.run('t2', 'Two', NOW, '2026-10-04T00:00:00.000Z', 0);
    ins.run('t3', 'Three', NOW, '2026-10-03T00:00:00.000Z', 0);
    ins.run('t4', 'Four', NOW, '2026-10-02T00:00:00.000Z', 0);
    ins.run('t5', 'Gone', NOW, '2026-10-09T00:00:00.000Z', 1);
    const f = home(null).forum;
    expect(f.map((t) => t.id)).toEqual(['t2', 't3', 't4']);
    expect(f[0]).toEqual({ id: 't2', title: 'Two', category: 'general', replyCount: 0, lastPostAt: '2026-10-04T00:00:00.000Z', author: 'ALICE' });
  });

  it('learn = approved puzzle total; solved only for members', () => {
    const ins = db.prepare(`INSERT INTO puzzles (id, author_id, title, rule, board_size, stones, to_move, mode, answers, level, status, position_hash, created_at, updated_at)
      VALUES (?, 'alice', 't', 'freestyle', 15, '[]', 'BLACK', 'final_move', '[]', 'beginner', ?, ?, ?, ?)`);
    ins.run('p1', 'approved', 'h1', NOW, NOW);
    ins.run('p2', 'approved', 'h2', NOW, NOW);
    ins.run('p3', 'pending', 'h3', NOW, NOW);
    db.prepare("INSERT INTO puzzle_progress (user_id, puzzle_id, attempts, solved_at) VALUES ('alice', 'p1', 1, ?)").run(NOW);
    expect(home(null).learn).toEqual({ total: 2, solved: null });
    expect(home({ userId: 'g', isGuest: true }).learn).toEqual({ total: 2, solved: null });
    expect(home(ME('alice')).learn).toEqual({ total: 2, solved: 1 });
    expect(home(ME('boss')).learn).toEqual({ total: 2, solved: 0 });
  });

  it('newcomer: guests and members with < 5 games; boundary at 4 / 5', () => {
    expect(home(null).newcomer).toBe(true);
    expect(home({ userId: 'g', isGuest: true }).newcomer).toBe(true);
    const g = db.prepare(`INSERT INTO games (id, room_id, black_player_id, white_player_id, black_player_name, white_player_name, winner, reason, board_size, started_at, ended_at)
      VALUES (?, 'r', 'alice', NULL, 'A', 'G', 'BLACK', 'normal', 15, ?, ?)`);
    const pg = db.prepare("INSERT INTO player_games (player_id, game_id) VALUES ('alice', ?)");
    for (let i = 1; i <= 4; i++) { g.run('g' + i, NOW, NOW); pg.run('g' + i); }
    expect(home(ME('alice')).newcomer).toBe(true);
    g.run('g5', NOW, NOW); pg.run('g5');
    expect(home(ME('alice')).newcomer).toBe(false);
  });
});
