'use strict';

/**
 * dm-route.test.js — persisted DMs (#198 slice 4): REST, socket-handler persistence, unread, bell, live push.
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
const dmRouter = require('../routes/dm');
const notif = require('../managers/NotificationService');
const dm = require('../managers/DmService');
const dmText = require('../managers/DmText');
const { sessions } = require('../socket/state');
const PrivateChatHandler = require('../socket/handlers/PrivateChatHandler');
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

const post = (as, to, text) => call('POST', `/api/dm/${to}`, as, { text });
const bellTypes = (id) => notif.list(id, 50).items.map((n) => n.type);
let live;

function fakeSocket(userId, displayName, isGuest = false) {
  const handlers = {};
  return { id: 's-' + userId, user: { userId, displayName, isGuest }, emit: jest.fn(), on: (e, fn) => { handlers[e] = fn; }, fire: (e, p) => handlers[e] && handlers[e](p) };
}

beforeAll(async () => {
  addUser('ann'); addUser('bob'); addUser('cat');
  const app = express();
  app.use('/api/dm', dmRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  PrivateChatHandler.setStore(dm);
});
afterAll(() => new Promise((r) => server.close(r)));
beforeEach(() => {
  db.prepare('DELETE FROM direct_messages').run();
  db.prepare('DELETE FROM notifications').run();
  sessions.clear();
  for (const id of Object.values(U)) dmText.forget(id);
  live = [];
  notif.setEmitter((userId, event, payload) => live.push({ userId, event, payload }));
  dm.setHooks({ isOnline: (id) => sessions.has(id) });
});

describe('REST send / thread', () => {
  it('stores in wire form (escaped), returns the thread oldest→newest with mine flags', async () => {
    const r = await post('ann', 'bob', 'hi <b>there</b>');
    expect(r.status).toBe(201);
    expect(r.body.text).toBe('hi &lt;b&gt;there&lt;/b&gt;');
    await post('bob', 'ann', 'yo');
    const t = (await call('GET', '/api/dm/bob', 'ann')).body;
    expect(t.with).toMatchObject({ username: 'bob' });
    expect(t.messages.map((m) => [m.mine, m.text])).toEqual([[true, 'hi &lt;b&gt;there&lt;/b&gt;'], [false, 'yo']]);
    expect(t.hasMore).toBe(false);
  });

  it('rejects empty, self, unknown user, guests, logged-out; rate limit blocks the 6th', async () => {
    expect((await post('ann', 'bob', '   ')).body.code).toBe('EMPTY_MESSAGE');
    expect((await post('ann', 'ann', 'x')).body.code).toBe('CANNOT_CHAT_SELF');
    expect((await post('ann', 'nobody', 'x')).status).toBe(404);
    expect((await post('guest', 'bob', 'x')).status).toBe(403);
    expect((await post(undefined, 'bob', 'x')).status).toBe(401);
    for (let i = 0; i < 5; i++) expect((await post('ann', 'bob', 'm' + i)).status).toBe(201);
    expect((await post('ann', 'bob', 'm6')).body.code).toBe('PRIVATE_CHAT_RATE_LIMITED');
  });

  it('caps at 500 chars and masks profanity like the socket path', async () => {
    expect((await post('ann', 'bob', 'a'.repeat(501))).body.text).toBe('a'.repeat(500) + '…');
  });

  it('pages back 30 at a time with before=', async () => {
    for (let i = 1; i <= 35; i++) dm.save(U.ann, U.bob, 'm' + i);
    const p1 = (await call('GET', '/api/dm/bob', 'ann')).body;
    expect(p1.messages).toHaveLength(dm.PAGE);
    expect(p1.messages[0].text).toBe('m6');
    expect(p1.hasMore).toBe(true);
    const p2 = (await call('GET', `/api/dm/bob?before=${p1.messages[0].id}`, 'ann')).body;
    expect(p2.messages.map((m) => m.text)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(p2.hasMore).toBe(false);
  });

  it('keeps only the newest DM_KEEP messages of a conversation', () => {
    for (let i = 0; i < dm.DM_KEEP + 3; i++) dm.save(U.ann, U.bob, 'm' + i);
    const n = db.prepare('SELECT COUNT(*) AS n FROM direct_messages').get().n;
    expect(n).toBe(dm.DM_KEEP);
  });
});

describe('by-id endpoints (lobby chat windows)', () => {
  it('thread and read work by user id; unknown id is 404; guests 403', async () => {
    await post('ann', 'bob', 'hey');
    const t = (await call('GET', `/api/dm/id/${U.ann}`, 'bob')).body;
    expect(t.with.username).toBe('ann');
    expect(t.messages.map((m) => [m.mine, m.text, m.read])).toEqual([[false, 'hey', false]]);
    expect((await call('POST', `/api/dm/id/${U.ann}/read`, 'bob')).body.unread).toBe(0);
    expect((await call('GET', `/api/dm/id/${U.ann}`, 'bob')).body.messages[0].read).toBe(true);
    expect(bellTypes(U.bob)).toEqual([]);
    expect((await call('GET', '/api/dm/id/nobody-id', 'bob')).status).toBe(404);
    expect((await call('GET', `/api/dm/id/${U.ann}`, 'guest')).status).toBe(403);
  });
});

describe('unread, conversations, bell', () => {
  it('offline recipient: unread count + one bell entry per sender (replaced, not stacked); live push when online', async () => {
    await post('ann', 'bob', 'one');
    await post('ann', 'bob', 'two');
    expect(bellTypes(U.bob)).toEqual(['dm']);
    const c = (await call('GET', '/api/dm', 'bob')).body.conversations;
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ with: { username: 'ann' }, unread: 2, last: { text: 'two', mine: false } });
    expect(live.filter((e) => e.event === 'private_message:receive')).toHaveLength(0);

    sessions.set(U.bob, fakeSocket(U.bob, 'BOB'));
    live.length = 0;
    await post('ann', 'bob', 'three');
    const rx = live.find((e) => e.event === 'private_message:receive');
    expect(rx).toMatchObject({ userId: U.bob, payload: { text: 'three', conversationWith: U.ann, fromUserId: U.ann } });
    expect(bellTypes(U.bob)).toEqual(['dm']); // online: no new notification, the old one stays
  });

  it('read marks only their messages to me, clears the bell entry, and conversations sort newest first', async () => {
    await post('ann', 'bob', 'a1');
    await post('cat', 'bob', 'c1');
    await post('bob', 'ann', 'b1');
    expect((await call('POST', '/api/dm/ann/read', 'bob')).body.unread).toBe(1);
    expect(notif.list(U.bob).items.map((n) => n.payload.from.username)).toEqual(['cat']);
    const mine = (await call('GET', '/api/dm', 'bob')).body.conversations;
    expect(mine.map((x) => [x.with.username, x.unread])).toEqual([['ann', 0], ['cat', 1]]);
    expect((await call('GET', '/api/dm/ann', 'bob')).body.messages.find((m) => !m.mine).read).toBe(true);
    // ann's own message to bob is read-state of bob, untouched by ann reading
    expect((await call('GET', '/api/dm', 'ann')).body.conversations[0].unread).toBe(1);
  });
});

describe('socket handler persistence', () => {
  it('member→member via socket is stored; offline recipient is no longer an error and gets a bell entry', () => {
    const a = fakeSocket(U.ann, 'ANN');
    sessions.set(U.ann, a);
    PrivateChatHandler.register({}, a);
    a.fire('private_message:send', { toUserId: U.bob, text: 'hello' });
    expect(a.emit.mock.calls.filter((c) => c[0] === 'private_message:error')).toHaveLength(0);
    const echo = a.emit.mock.calls.find((c) => c[0] === 'private_message:receive')[1];
    expect(echo).toMatchObject({ text: 'hello', conversationWith: U.bob });
    expect(dm.history(U.bob, 'ann').messages.map((m) => m.text)).toEqual(['hello']);
    expect(dm.history(U.bob, 'ann').messages[0].id).toBe(Number(echo.messageId));
    expect(bellTypes(U.bob)).toEqual(['dm']);
  });

  it('online recipient gets the live event and no bell entry; guest recipient stays ephemeral (offline = error)', () => {
    const a = fakeSocket(U.ann, 'ANN');
    const b = fakeSocket(U.bob, 'BOB');
    sessions.set(U.ann, a); sessions.set(U.bob, b);
    PrivateChatHandler.register({}, a);
    a.fire('private_message:send', { toUserId: U.bob, text: 'hey' });
    expect(b.emit.mock.calls.find((c) => c[0] === 'private_message:receive')[1].text).toBe('hey');
    expect(bellTypes(U.bob)).toEqual([]);
    expect(dm.history(U.bob, 'ann').messages).toHaveLength(1);

    a.fire('private_message:send', { toUserId: 'guest-xyz', text: 'anyone?' });
    expect(a.emit.mock.calls.filter((c) => c[0] === 'private_message:error').pop()[1]).toEqual({ code: 'RECIPIENT_OFFLINE' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM direct_messages').get().n).toBe(1);
  });

  it('a guest sender is never persisted', () => {
    const g = fakeSocket('guest-1', 'Guest', true);
    const b = fakeSocket(U.bob, 'BOB');
    sessions.set('guest-1', g); sessions.set(U.bob, b);
    PrivateChatHandler.register({}, g);
    g.fire('private_message:send', { toUserId: U.bob, text: 'psst' });
    expect(b.emit.mock.calls.find((c) => c[0] === 'private_message:receive')[1].text).toBe('psst');
    expect(db.prepare('SELECT COUNT(*) AS n FROM direct_messages').get().n).toBe(0);
  });
});
