'use strict';

/**
 * presence-route.test.js — POST /api/presence (#372 review).
 * The per-member budget, not a per-IP one: members sharing an IP (CGNAT, school/café) must not
 * 429 each other offline. Session = raw cookie header = user id.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../socket/home-feed', () => ({ scheduleHomeUpdate: jest.fn(), register: jest.fn() }));
jest.mock('../middleware/auth', () => ({
  verifyToken: (req, res, next) => {
    if (!req.headers.cookie) return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = req.headers.cookie === 'guest'
      ? { userId: 'guest_abc', displayName: 'G', isGuest: true }
      : { userId: req.headers.cookie, displayName: req.headers.cookie.toUpperCase(), isGuest: false };
    next();
  },
}));

const express = require('express');
const http = require('http');
const state = require('../socket/state');
const presenceRouter = require('../routes/presence');

let server, base;
beforeAll((done) => {
  const app = express();
  app.use('/api/presence', presenceRouter);
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); });
});
afterAll((done) => { state.heartbeats.clear(); server.close(done); });

function post(as, presence = 'active') {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ presence });
    const headers = { 'Content-Type': 'application/json' };
    if (as) headers.cookie = as;
    const r = http.request(base + '/api/presence', { method: 'POST', headers }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', reject);
    r.end(body);
  });
}

test('signed-out → 401, guest → 403; member beat → 204 and present', async () => {
  expect(await post(null)).toBe(401);
  expect(await post('guest')).toBe(403);
  expect(await post('m0')).toBe(204);
  expect(state.isPresent('m0')).toBe(true);
  expect(await post('m0', 'away')).toBe(204);
  expect(state.isPresent('m0')).toBe(false);
});

test('rate limit is per member: one member over budget does not 429 another on the same IP', async () => {
  const codes = [];
  for (let i = 0; i < 61; i++) codes.push(await post('busy'));
  expect(codes.slice(0, 60).every((c) => c === 204)).toBe(true);
  expect(codes[60]).toBe(429);
  // Many members behind one IP (all requests here come from 127.0.0.1).
  for (let k = 0; k < 20; k++) expect(await post(`n${k}`)).toBe(204);
});
