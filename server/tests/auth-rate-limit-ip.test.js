'use strict';

/**
 * auth-rate-limit-ip.test.js — authLimiter's keyGenerator (TODO.md #92).
 *
 * Every other auth.js test suite mocks `express-rate-limit` away entirely
 * (see auth-session-routes.test.js) so the 20-req/15m budget doesn't leak
 * into unrelated test cases. This suite is the one place that mounts the
 * REAL limiter, specifically to prove the bug fixed here: before the
 * keyGenerator existed, express-rate-limit's default key is `req.ip`, which
 * behind this deployment's Cloudflare Tunnel resolves to the tunnel's own
 * loopback peer address for every visitor — collapsing every real client
 * into ONE shared budget instead of one each.
 */

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

jest.mock('../db/database', () => ({
  createSession: jest.fn(() => {}),
  getSessionById: jest.fn(),
  hasLiveGuestSessionWithDisplayName: jest.fn(() => false),
  revokeSession: jest.fn(() => ({ changes: 1 })),
  revokeSessionsForUser: jest.fn(() => ({ changes: 0 })),
  touchSession: jest.fn(),
  deleteExpiredSessions: jest.fn(() => ({ changes: 0 })),
}));

const express = require('express');
const http    = require('http');

let server, baseUrl;

beforeAll(async () => {
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json());
  app.use('/api/auth', require('../routes/auth'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

/** POST /api/auth/guest as a simulated client IP, via CF-Connecting-IP. */
function guestAs(cfConnectingIp) {
  return fetch(`${baseUrl}/api/auth/guest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': cfConnectingIp },
    body: '{}',
  });
}

test('two different client IPs get independent 20-request budgets, not one shared budget', async () => {
  for (let i = 0; i < 20; i += 1) {
    const res = await guestAs('203.0.113.9');
    expect(res.status).toBe(200);
  }
  const exhausted = await guestAs('203.0.113.9');
  expect(exhausted.status).toBe(429);

  // The actual regression: a different real client IP, arriving over the
  // exact same loopback peer a test server sees (mirroring the tunnel), must
  // still get its own budget rather than inheriting the first IP's 429.
  const otherClient = await guestAs('198.51.100.20');
  expect(otherClient.status).toBe(200);
}, 15000);
