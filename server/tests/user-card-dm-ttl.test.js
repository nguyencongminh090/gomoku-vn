'use strict';

/**
 * B220 — lobby user card endpoint + 3-day DM retention. Real SQL on an in-memory DB;
 * "session" = raw cookie header = user id.
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
  verifyToken: (req, res, next) => { req.user = { userId: req.headers.cookie }; next(); },
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const profileRouter = require('../routes/profile');
const dm = require('../managers/DmService');

const NOW = '2026-10-09T00:00:00.000Z';
const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const B = 'bbbbbbbb-2222-4222-8222-222222222222';
const db = database.db;
let server, base;

const get = (urlPath, cookie) => new Promise((resolve, reject) => {
  const r = http.request(base + urlPath, { headers: cookie ? { cookie } : {} }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString()) }));
  });
  r.on('error', reject);
  r.end();
});

beforeAll(async () => {
  const add = (id, name) => db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`
  ).run(id, name, name.toUpperCase(), NOW);
  add(A, 'alice');
  add(B, 'bob');
  db.prepare(`INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?, 'freestyle', 1500, 100, 0.06, 20, ?)`).run(B, NOW);
  const app = express();
  app.use('/api/profile', profileRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

describe('GET /api/profile/card/:userId', () => {
  it('returns a compact card with friendship and permissions for a viewer', async () => {
    const r = await get(`/api/profile/card/${B}`, A);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ userId: B, username: 'bob', displayName: 'BOB', isSelf: false, friendship: 'none' });
    expect(r.json.ratings[0]).toMatchObject({ category: 'freestyle', rating: 1500 });
    expect(r.json.can).toEqual({ dm: true, friend: true });
    expect(r.json).not.toHaveProperty('recent');
  });

  it('has no actions for a guest viewer and for yourself', async () => {
    expect((await get(`/api/profile/card/${B}`, 'guest')).json.can).toBeUndefined();
    const self = await get(`/api/profile/card/${A}`, A);
    expect(self.json.isSelf).toBe(true);
    expect(self.json.can).toBeUndefined();
  });

  it('404s for an unknown id (guest ids are not users)', async () => {
    expect((await get('/api/profile/card/guest-xyz', A)).status).toBe(404);
  });

  it('hides game stats when the owner hides history', async () => {
    db.prepare('UPDATE users SET hide_history = 1 WHERE id = ?').run(B);
    expect((await get(`/api/profile/card/${B}`, A)).json.stats).toBeNull();
    db.prepare('UPDATE users SET hide_history = 0 WHERE id = ?').run(B);
  });
});

describe('DM retention (3 days)', () => {
  const count = () => db.prepare('SELECT COUNT(*) AS n FROM direct_messages').get().n;
  beforeEach(() => db.prepare('DELETE FROM direct_messages').run());

  it('exposes a 3-day TTL', () => {
    expect(dm.DM_TTL_MS).toBe(3 * 24 * 3600 * 1000);
  });

  it('prunes only messages older than the TTL (boundary)', () => {
    const now = Date.now();
    const ins = (ms) => db.prepare('INSERT INTO direct_messages (conv_key, sender_id, recipient_id, body, created_at) VALUES (?,?,?,?,?)')
      .run(`${A}|${B}`, A, B, 'x', new Date(ms).toISOString());
    ins(now - dm.DM_TTL_MS - 1000);
    ins(now - dm.DM_TTL_MS + 60000);
    ins(now);
    expect(dm.pruneExpired(now, true)).toBe(1);
    expect(count()).toBe(2);
  });

  it('history never returns an expired message, even inside the prune throttle window', () => {
    const now = Date.now();
    db.prepare('INSERT INTO direct_messages (conv_key, sender_id, recipient_id, body, created_at) VALUES (?,?,?,?,?)')
      .run(`${A}|${B}`, A, B, 'old', new Date(now - dm.DM_TTL_MS - 5000).toISOString());
    dm.pruneExpired(now, true); // sets the throttle stamp
    db.prepare('INSERT INTO direct_messages (conv_key, sender_id, recipient_id, body, created_at) VALUES (?,?,?,?,?)')
      .run(`${A}|${B}`, A, B, 'old2', new Date(now - dm.DM_TTL_MS - 5000).toISOString());
    const h = dm.historyById(A, B);
    expect(h.messages.map((m) => m.text)).toEqual([]);
  });
});
