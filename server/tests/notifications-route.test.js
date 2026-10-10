'use strict';

/**
 * notifications-route.test.js — /api/notifications + friend hooks + live emitter (#198 slice 2).
 * Real SQL on an in-memory DB; session = raw cookie header = user id.
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
const friendsRouter = require('../routes/friends');
const notificationsRouter = require('../routes/notifications');
const notif = require('../managers/NotificationService');
const svc = require('../managers/FriendService');

const NOW = '2026-10-09T00:00:00.000Z';
const db = database.db;
const U = {};
let server, base;

function addUser(name, rating) {
  const id = `${name}-id`;
  U[name] = id;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`)
    .run(id, name, name.toUpperCase(), NOW);
  if (rating) {
    db.prepare(`INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?, 'freestyle', ?, 100, 0.06, 20, ?)`)
      .run(id, rating, NOW);
  }
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

let pushed;
const mine = (as) => call('GET', '/api/notifications', as);

beforeAll(async () => {
  addUser('ann'); addUser('bob'); addUser('cat');
  const app = express();
  app.use('/api/friends', friendsRouter);
  app.use('/api/notifications', notificationsRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
beforeEach(() => {
  db.prepare('DELETE FROM friendships').run();
  db.prepare('DELETE FROM notifications').run();
  pushed = [];
  notif.setEmitter((userId, event, payload) => pushed.push({ userId, event, payload }));
});

describe('friend hooks', () => {
  it('request notifies the target (stored + live); sender gets nothing', async () => {
    await call('POST', '/api/friends/bob', 'ann');
    const b = (await mine('bob')).body;
    expect(b.unread).toBe(1);
    expect(b.items[0]).toMatchObject({ type: 'friend_request', read: false, payload: { from: { username: 'ann', displayName: 'ANN' } } });
    expect((await mine('ann')).body.items).toHaveLength(0);
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ userId: U.bob, event: 'notify:new', payload: { type: 'friend_request', unread: 1 } });
  });

  it('accept notifies the requester and clears the request from the accepter bell', async () => {
    await call('POST', '/api/friends/bob', 'ann');
    await call('POST', '/api/friends/ann/accept', 'bob');
    expect((await mine('bob')).body.items).toHaveLength(0);
    expect((await mine('ann')).body.items.map((n) => n.type)).toEqual(['friend_accepted']);
  });

  it('crossed requests end as one friend_accepted for the first requester', async () => {
    await call('POST', '/api/friends/bob', 'ann');
    await call('POST', '/api/friends/ann', 'bob');
    expect((await mine('bob')).body.items).toHaveLength(0);
    expect((await mine('ann')).body.items.map((n) => n.type)).toEqual(['friend_accepted']);
  });

  it('cancel / decline remove the pending request notification; re-request does not stack', async () => {
    await call('POST', '/api/friends/bob', 'ann');
    await call('DELETE', '/api/friends/bob', 'ann');
    expect((await mine('bob')).body.items).toHaveLength(0);
    await call('POST', '/api/friends/bob', 'ann');
    await call('DELETE', '/api/friends/bob', 'ann');
    await call('POST', '/api/friends/bob', 'ann');
    expect((await mine('bob')).body.items).toHaveLength(1);
  });
});

describe('read / list', () => {
  it('mark one read, then all read; other users untouched', async () => {
    notif.push(U.bob, 'dm', U.ann, { from: { username: 'ann' } });
    notif.push(U.bob, 'dm', U.cat, { from: { username: 'cat' } });
    notif.push(U.ann, 'dm', U.cat, {});
    const items = (await mine('bob')).body.items;
    expect(items).toHaveLength(2);
    expect((await call('POST', '/api/notifications/read', 'bob', { id: items[0].id })).body.unread).toBe(1);
    expect((await call('POST', '/api/notifications/read', 'bob', {})).body.unread).toBe(0);
    expect((await mine('ann')).body.unread).toBe(1);
  });

  it("cannot mark someone else's notification read", async () => {
    const n = notif.push(U.ann, 'dm', U.cat, {});
    await call('POST', '/api/notifications/read', 'bob', { id: n.id });
    expect((await mine('ann')).body.unread).toBe(1);
  });

  it('keeps only the newest MAX_PER_USER, newest first', () => {
    for (let i = 0; i < notif.MAX_PER_USER + 5; i++) notif.push(U.bob, 'dm', `actor${i}`, { i });
    const { items } = notif.list(U.bob, 500);
    expect(items).toHaveLength(notif.MAX_PER_USER);
    expect(items[0].payload.i).toBe(notif.MAX_PER_USER + 4);
  });

  it('rejects unknown types; guests 403; logged-out 401; emitter failure does not break push', async () => {
    expect(() => notif.push(U.bob, 'nope', null, {})).toThrow();
    expect((await mine('guest')).status).toBe(403);
    expect((await mine()).status).toBe(401);
    notif.setEmitter(() => { throw new Error('socket gone'); });
    expect(() => notif.push(U.bob, 'dm', null, {})).not.toThrow();
  });
});
