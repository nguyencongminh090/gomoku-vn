'use strict';

/**
 * shell-route.test.js — GET /api/shell (B269): the three nav calls in one body.
 * Bodies must equal what /api/rankings/me, /api/admin/me and /api/notifications return.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
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
const rankingsRouter = require('../routes/rankings');
const adminRouter = require('../routes/admin');
const notificationsRouter = require('../routes/notifications');
const shellRouter = require('../routes/shell');

let server;
let base;
beforeAll(async () => {
  const app = express();
  app.use('/api/rankings', rankingsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/shell', shellRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

const get = async (url, cookie) => {
  const res = await fetch(base + url, { headers: cookie ? { cookie } : {} });
  return { status: res.status, body: await res.json(), cc: res.headers.get('cache-control') };
};

test('member: one body equal to the three endpoints, no-store', async () => {
  const uid = 'u-shell';
  const [shell, me, admin, notes] = await Promise.all([
    get('/api/shell', uid), get('/api/rankings/me', uid), get('/api/admin/me', uid), get('/api/notifications', uid),
  ]);
  expect(shell.status).toBe(200);
  expect(shell.cc).toBe('no-store');
  expect(shell.body).toEqual({ me: me.body, admin: admin.body, notifications: notes.body });
});

test('guest: 403 GUEST_FORBIDDEN; signed out: 401', async () => {
  const g = await get('/api/shell', 'guest');
  expect(g.status).toBe(403);
  expect(g.body.code).toBe('GUEST_FORBIDDEN');
  expect((await get('/api/shell')).status).toBe(401);
});
