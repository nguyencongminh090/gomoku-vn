'use strict';

/**
 * forum-route.test.js — /api/forum (#203 7c): guests read / members write / staff delete + resolve,
 * validation boundaries, soft delete never leaks bodies, reports, throttles. Real SQL, in-memory DB.
 */

jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] });

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../utils/session-cookie', () => ({ readSessionIdFromHeader: (h) => h || null }));
jest.mock('../managers/SessionManager', () => ({
  getValidSession: (sid) => ({ userId: sid === 'guest' ? null : sid }),
}));
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
const forumRouter = require('../routes/forum');

const NOW = '2026-10-10T00:00:00.000Z';
const db = database.db;
const U = {};
let server, base;

function addUser(name, admin = 0) {
  U[name] = `${name}-id`;
  db.prepare("INSERT INTO users (id, username, password_hash, display_name, created_at, is_admin) VALUES (?, ?, 'x', ?, ?, ?)")
    .run(U[name], name, name.toUpperCase(), NOW, admin);
}

function call(method, urlPath, as, body) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (as) headers.cookie = U[as] || as;
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
    }
    const r = http.request(base + urlPath, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

const tick = (ms = 61 * 1000) => jest.setSystemTime(Date.now() + ms); // past both cooldowns
const thread = (over = {}) => ({ category: 'general', title: 'Khai cuộc', body: 'Mọi người chơi gì?', ...over });
async function mkThread(as = 'alice', over) {
  tick();
  const r = await call('POST', '/api/forum/threads', as, thread(over));
  expect(r.status).toBe(201);
  return r.body.id;
}

beforeAll(async () => {
  ['alice', 'bob'].forEach((n) => addUser(n));
  addUser('boss', 1);
  const app = express();
  app.use('/api/forum', forumRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

describe('access matrix', () => {
  it('meta + list + thread are public; writes need a member', async () => {
    expect((await call('GET', '/api/forum/meta')).body.categories).toEqual(['general', 'tactics', 'analysis', 'help']);
    expect((await call('GET', '/api/forum/threads')).status).toBe(200);
    expect((await call('GET', '/api/forum/threads')).body.canModerate).toBe(false);
    expect((await call('GET', '/api/forum/threads', 'boss')).body.canModerate).toBe(true);
    const id = await mkThread();
    expect((await call('GET', `/api/forum/threads/${id}`)).status).toBe(200);
    for (const [m, p, b] of [['POST', '/api/forum/threads', thread()], ['POST', `/api/forum/threads/${id}/posts`, { body: 'x' }], ['POST', '/api/forum/report', { type: 'thread', id, reason: 'x' }]]) {
      expect((await call(m, p, undefined, b)).status).toBe(401);
      const g = await call(m, p, 'guest', b);
      expect([g.status, g.body.code]).toEqual([403, 'GUEST_FORBIDDEN']);
    }
  });

  it('staff-only routes refuse members (delete, reports, resolve)', async () => {
    const id = await mkThread();
    for (const [m, p, b] of [['DELETE', `/api/forum/threads/${id}`], ['GET', '/api/forum/reports'], ['POST', '/api/forum/reports/x/resolve', {}], ['DELETE', '/api/forum/posts/x']]) {
      const r = await call(m, p, 'bob', b);
      expect([r.status, r.body.code]).toEqual([403, 'FORUM_FORBIDDEN']);
    }
  });
});

describe('threads + replies', () => {
  it('create → list (newest activity first) → reply bumps the thread and counts', async () => {
    const a = await mkThread('alice', { title: 'A' });
    const b = await mkThread('bob', { title: 'B', category: 'tactics' });
    expect((await call('GET', '/api/forum/threads')).body.threads.slice(0, 2).map((t) => t.title)).toEqual(['B', 'A']);
    tick();
    expect((await call('POST', `/api/forum/threads/${a}/posts`, 'bob', { body: 'Hay đó\n\n\n\nNhé' })).status).toBe(201);
    const list = (await call('GET', '/api/forum/threads')).body.threads;
    expect(list[0]).toMatchObject({ id: a, replyCount: 1 });
    expect(list.map((t) => t.id)).toContain(b);
    const t = (await call('GET', `/api/forum/threads/${a}`)).body;
    expect(t.posts[0].body).toBe('Hay đó\n\nNhé'); // 3+ blank lines collapsed, text otherwise kept as typed
    expect(t.posts[0].author).toEqual({ username: 'bob', displayName: 'BOB' });
    expect(t.canModerate).toBe(false);
  });

  it('category filter, and an unknown category is rejected', async () => {
    const list = (await call('GET', '/api/forum/threads?category=tactics')).body.threads;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((t) => t.category === 'tactics')).toBe(true);
    const r = await call('GET', '/api/forum/threads?category=nope');
    expect([r.status, r.body.code]).toEqual([400, 'FORUM_CATEGORY_INVALID']);
  });

  it.each([
    ['empty title', { title: '   ' }, 'FORUM_TITLE_INVALID'],
    ['title 101', { title: 'a'.repeat(101) }, 'FORUM_TITLE_INVALID'],
    ['empty body', { body: '' }, 'FORUM_BODY_INVALID'],
    ['body 4001', { body: 'a'.repeat(4001) }, 'FORUM_BODY_INVALID'],
    ['bad category', { category: 'x' }, 'FORUM_CATEGORY_INVALID'],
    ['non-string title', { title: 5 }, 'FORUM_TITLE_INVALID'],
  ])('rejects %s', async (_n, over, code) => {
    tick();
    const r = await call('POST', '/api/forum/threads', 'alice', thread(over));
    expect([r.status, r.body.code]).toEqual([400, code]);
  });

  it('accepts the boundaries (title 100, body 4000) and keeps "<b>" as typed text', async () => {
    tick();
    const r = await call('POST', '/api/forum/threads', 'alice', thread({ title: '<b>' + 'a'.repeat(96), body: 'b'.repeat(4000) }));
    expect(r.status).toBe(201);
    const t = (await call('GET', `/api/forum/threads/${r.body.id}`)).body.thread;
    expect(t.title.startsWith('<b>')).toBe(true);
    expect(t.body).toHaveLength(4000);
  });

  it('throttles: a second thread within a minute and a second reply within 10 s → 429', async () => {
    tick();
    expect((await call('POST', '/api/forum/threads', 'bob', thread())).status).toBe(201);
    const again = await call('POST', '/api/forum/threads', 'bob', thread());
    expect([again.status, again.body.code]).toEqual([429, 'FORUM_RATE_LIMITED']);
    const id = await mkThread('alice');
    tick();
    expect((await call('POST', `/api/forum/threads/${id}/posts`, 'bob', { body: 'a' })).status).toBe(201);
    expect((await call('POST', `/api/forum/threads/${id}/posts`, 'bob', { body: 'b' })).status).toBe(429);
  });

  it('replying to a missing thread → 404; pagination of replies (30/page)', async () => {
    tick();
    expect((await call('POST', '/api/forum/threads/nope/posts', 'bob', { body: 'x' })).status).toBe(404);
    const id = await mkThread('alice');
    const ins = db.prepare('INSERT INTO forum_posts (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)');
    for (let i = 0; i < 31; i++) ins.run(`p${i}`, id, U.bob, `r${i}`, new Date(Date.now() + i).toISOString());
    const p1 = (await call('GET', `/api/forum/threads/${id}`)).body;
    expect([p1.posts.length, p1.pagination.totalPages]).toEqual([30, 2]);
    expect((await call('GET', `/api/forum/threads/${id}?page=2`)).body.posts.map((p) => p.body)).toEqual(['r30']);
  });
});

describe('staff delete', () => {
  it('a deleted reply keeps its slot but never its body; reply_count drops; repeat is a no-op', async () => {
    const id = await mkThread('alice');
    tick();
    const pid = (await call('POST', `/api/forum/threads/${id}/posts`, 'bob', { body: 'bí mật' })).body.id;
    expect((await call('DELETE', `/api/forum/posts/${pid}`, 'boss')).status).toBe(200);
    expect((await call('DELETE', `/api/forum/posts/${pid}`, 'boss')).status).toBe(200);
    const t = (await call('GET', `/api/forum/threads/${id}`)).body;
    expect(t.posts[0]).toMatchObject({ id: pid, body: '', deleted: true });
    expect(JSON.stringify(t)).not.toContain('bí mật');
    expect(t.thread.replyCount).toBe(0);
  });

  it('a deleted thread vanishes from the list and 404s for non-staff (staff still open it, without the body)', async () => {
    const id = await mkThread('alice', { title: 'Sẽ xoá', body: 'nội dung riêng' });
    expect((await call('DELETE', `/api/forum/threads/${id}`, 'boss')).status).toBe(200);
    expect((await call('GET', '/api/forum/threads')).body.threads.map((t) => t.id)).not.toContain(id);
    expect((await call('GET', `/api/forum/threads/${id}`, 'bob')).status).toBe(404);
    expect((await call('GET', `/api/forum/threads/${id}`)).status).toBe(404);
    const staff = (await call('GET', `/api/forum/threads/${id}`, 'boss')).body;
    expect([staff.thread.deleted, staff.thread.body, staff.canModerate]).toEqual([true, '', true]);
    tick();
    expect((await call('POST', `/api/forum/threads/${id}/posts`, 'bob', { body: 'x' })).status).toBe(404);
    expect((await call('DELETE', '/api/forum/threads/nope', 'boss')).status).toBe(404);
  });
});

describe('reports', () => {
  it('report → staff sees it with an excerpt → resolve with remove deletes the target and closes duplicates', async () => {
    const id = await mkThread('alice', { title: 'Spam', body: 'mua bán' });
    expect((await call('POST', '/api/forum/report', 'bob', { type: 'thread', id, reason: 'spam' })).status).toBe(200);
    tick();
    expect((await call('POST', '/api/forum/report', 'bob', { type: 'thread', id, reason: 'again' })).status).toBe(200); // same reporter: no second row
    tick(); // distinct created_at: the queue is oldest-first, so same-millisecond rows would order by random id
    expect((await call('POST', '/api/forum/report', 'alice', { type: 'thread', id, reason: 'tự báo' })).status).toBe(200);
    const q = (await call('GET', '/api/forum/reports', 'boss')).body;
    const mine = q.reports.filter((r) => r.targetId === id);
    expect(mine).toHaveLength(2);
    expect(mine[0]).toMatchObject({ type: 'thread', threadId: id, reason: 'spam', reporter: { username: 'bob' } });
    expect(mine[0].excerpt).toContain('Spam — mua bán');
    expect((await call('POST', `/api/forum/reports/${mine[0].id}/resolve`, 'boss', { remove: true })).status).toBe(200);
    expect((await call('GET', '/api/forum/reports', 'boss')).body.reports.filter((r) => r.targetId === id)).toHaveLength(0);
    expect((await call('GET', `/api/forum/threads/${id}`, 'bob')).status).toBe(404);
  });

  it('dismissing keeps the content; a reply can be reported; bad input is rejected', async () => {
    const id = await mkThread('alice');
    tick();
    const pid = (await call('POST', `/api/forum/threads/${id}/posts`, 'bob', { body: 'ok' })).body.id;
    expect((await call('POST', '/api/forum/report', 'alice', { type: 'post', id: pid, reason: 'hiểu lầm' })).status).toBe(200);
    const rep = (await call('GET', '/api/forum/reports', 'boss')).body.reports.find((r) => r.targetId === pid);
    expect(rep).toMatchObject({ type: 'post', threadId: id });
    expect((await call('POST', `/api/forum/reports/${rep.id}/resolve`, 'boss', {})).status).toBe(200);
    expect((await call('GET', `/api/forum/threads/${id}`)).body.posts[0].deleted).toBe(false);
    for (const [body, code] of [[{ type: 'user', id, reason: 'x' }, 'FORUM_TARGET_INVALID'], [{ type: 'thread', id, reason: '' }, 'FORUM_REASON_INVALID'], [{ type: 'thread', id, reason: 'a'.repeat(201) }, 'FORUM_REASON_INVALID']]) {
      const r = await call('POST', '/api/forum/report', 'bob', body);
      expect([r.status, r.body.code]).toEqual([400, code]);
    }
    expect((await call('POST', '/api/forum/report', 'bob', { type: 'post', id: 'nope', reason: 'x' })).status).toBe(404);
    expect((await call('POST', '/api/forum/reports/nope/resolve', 'boss', {})).status).toBe(404);
  });
});
