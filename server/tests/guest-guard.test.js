'use strict';

/**
 * guest-guard.test.js — #280. A guest session is `guest_…` userId + isGuest (no users row), so the old
 * `!req.user.userId` check never fired. Real guest shape, every member-only route, plus the unit.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../middleware/auth', () => ({
  verifyToken: (req, res, next) => {
    const c = req.headers.cookie;
    if (!c) return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = c === 'guest' ? { userId: 'guest_abc', isGuest: true } : { userId: c, isGuest: false };
    next();
  },
}));

const express = require('express');
const http = require('http');
const { rejectGuests, isGuestUser } = require('../middleware/guest-guard');

describe('isGuestUser', () => {
  it.each([
    [{ userId: 'guest_abc', isGuest: true }, true],
    [{ userId: 'guest_abc' }, true], // id alone is enough
    [{ userId: 'u1', isGuest: true }, true], // flag alone is enough
    [{ userId: null }, true],
    [undefined, true],
    [{ userId: 'u1', isGuest: false }, false],
  ])('%j → %s', (u, expected) => expect(isGuestUser(u)).toBe(expected));
});

describe('rejectGuests', () => {
  const run = (user) => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    rejectGuests('nope')({ user }, res, next);
    return { res, next };
  };
  it('403s a guest with the given message and does not continue', () => {
    const { res, next } = run({ userId: 'guest_x', isGuest: true });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'nope', code: 'GUEST_FORBIDDEN' });
    expect(next).not.toHaveBeenCalled();
  });
  it('lets a member through', () => {
    const { res, next } = run({ userId: 'u1', isGuest: false });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('games POST /:id/report', () => {
  let server, base;
  beforeAll(async () => {
    const app = express();
    app.use('/api/games', require('../routes/games'));
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));
  const post = (cookie) => new Promise((resolve, reject) => {
    const body = JSON.stringify({ reason: 'x' });
    const r = http.request(`${base}/api/games/g1/report`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, body: d ? JSON.parse(d) : null }));
    });
    r.on('error', reject); r.write(body); r.end();
  });
  it('403 GUEST_FORBIDDEN for a guest; a member reaches the handler (not 403)', async () => {
    const g = await post('guest');
    expect([g.status, g.body.code]).toEqual([403, 'GUEST_FORBIDDEN']);
    expect((await post('member1')).status).not.toBe(403);
  });
});
