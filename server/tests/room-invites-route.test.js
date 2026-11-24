/**
 * room-invites-route.test.js — /api/room-invites (F443): auth, validation, host-only send, accept → {roomId}
 * (never seated), decline, online candidates. Real SQL on an in-memory DB; session = raw cookie header = user id.
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
    req.user = req.headers.cookie === 'guest' ? { userId: 'guest_abc', isGuest: true } : { userId: req.headers.cookie }; // realistic guest (#280): a guest_… id + isGuest, never a null id
    next();
  },
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const roomInvitesRouter = require('../routes/room-invites');
const notif = require('../managers/NotificationService');
const svc = require('../managers/RoomInviteService');
const roomManager = require('../managers/RoomManager');

const NOW = '2026-11-24T00:00:00.000Z';
const db = database.db;
const U = {};
let server, base;

function addUser(name) {
  const id = `${name}-id`;
  U[name] = id;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`)
    .run(id, name, name.toUpperCase(), NOW);
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

const mkRoom = (as, ip = '1.1.1.1') => roomManager.createRoom({ userId: U[as], displayName: as.toUpperCase(), ip }, {}).room;
const invite = (as, to, roomId) => call('POST', '/api/room-invites', as, { to, roomId });
const invites = (as) => notif.list(U[as], 50).items.filter((n) => n.type === 'room_invite');

beforeAll(async () => {
  addUser('ann'); addUser('bob'); addUser('cat');
  const app = express();
  app.use('/api/room-invites', roomInvitesRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
beforeEach(() => {
  svc._reset();
  db.prepare('DELETE FROM notifications').run();
  db.prepare("UPDATE users SET who_can_challenge = 'everyone'").run();
  roomManager.rooms.clear();
  roomManager.userRoomMap.clear();
  notif.setEmitter(() => {});
  svc.setHooks({ onlineUsers: () => [] });
});

describe('auth', () => {
  it('401 logged-out and 403 guests on every endpoint', async () => {
    for (const [m, p] of [['GET', '/online'], ['POST', ''], ['POST', '/x/accept'], ['DELETE', '/x']]) {
      expect((await call(m, `/api/room-invites${p}`, undefined, m === 'POST' ? {} : undefined)).status).toBe(401);
      expect((await call(m, `/api/room-invites${p}`, 'guest', m === 'POST' ? {} : undefined)).status).toBe(403);
    }
  });
});

describe('POST /', () => {
  it('201 for the host: returns the invite and notifies the target', async () => {
    const room = mkRoom('ann');
    const r = await invite('ann', 'bob', room.roomId);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ roomId: room.roomId, to: { username: 'bob' } });
    expect(invites('bob')[0].payload).toMatchObject({ inviteId: r.body.id, roomId: room.roomId });
  });

  it('400 on a missing body, 403 NOT_IN_ROOM for a room the caller is not in, 403 NOT_HOST for a non-host member', async () => {
    const room = mkRoom('ann');
    expect((await call('POST', '/api/room-invites', 'ann', {})).body.code).toBe('BAD_REQUEST');
    expect((await invite('bob', 'cat', room.roomId)).body.code).toBe('NOT_IN_ROOM');
    roomManager.joinRoom({ userId: U.bob, displayName: 'BOB', isGuest: false }, room.roomId);
    const r = await invite('bob', 'cat', room.roomId);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('NOT_HOST');
  });
});

describe('accept / decline', () => {
  it('accept → 200 {roomId}; the invitee is not put in the room; a second accept is 404', async () => {
    const room = mkRoom('ann');
    const { id } = (await invite('ann', 'bob', room.roomId)).body;
    const r = await call('POST', `/api/room-invites/${id}/accept`, 'bob');
    expect(r).toMatchObject({ status: 200, body: { roomId: room.roomId } });
    expect(room.users.has(U.bob)).toBe(false);
    const again = await call('POST', `/api/room-invites/${id}/accept`, 'bob');
    expect(again.status).toBe(404);
    expect(again.body.code).toBe('INVITE_GONE');
  });

  it('409 when the invitee is already in another room; someone else cannot accept (403)', async () => {
    const room = mkRoom('ann');
    const { id } = (await invite('ann', 'bob', room.roomId)).body;
    expect((await call('POST', `/api/room-invites/${id}/accept`, 'cat')).status).toBe(403);
    mkRoom('bob', '2.2.2.2');
    expect((await call('POST', `/api/room-invites/${id}/accept`, 'bob')).status).toBe(409);
  });

  it('DELETE declines and is idempotent; the notification is gone', async () => {
    const { id } = (await invite('ann', 'bob', mkRoom('ann').roomId)).body;
    expect((await call('DELETE', `/api/room-invites/${id}`, 'bob')).body).toEqual({ ok: true });
    expect((await call('DELETE', `/api/room-invites/${id}`, 'bob')).status).toBe(200);
    expect(invites('bob')).toHaveLength(0);
  });
});

describe('GET /online', () => {
  it('403 NOT_HOST for anyone who is not the host of their room (no presence probing)', async () => {
    const room = mkRoom('ann');
    roomManager.joinRoom({ userId: U.bob, displayName: 'BOB', isGuest: false }, room.roomId);
    for (const as of ['bob', 'cat']) {
      const r = await call('GET', '/api/room-invites/online', as);
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('NOT_HOST');
    }
  });

  it('returns the hook-listed members the caller may invite, uncached', async () => {
    mkRoom('ann');
    svc.setHooks({ onlineUsers: () => [U.ann, U.bob, U.cat].map((userId) => ({ userId, isGuest: false })) });
    const r = await call('GET', '/api/room-invites/online', 'ann');
    expect(r.status).toBe(200);
    expect(r.body.players.map((p) => p.username).sort()).toEqual(['bob', 'cat']);
  });
});
