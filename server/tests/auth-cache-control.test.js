'use strict';

/**
 * auth-cache-control.test.js — Unit tests for TODO.md #66.
 *
 * POST /api/auth/{login,register,guest} return a fresh JWT in the response
 * body. Without an explicit Cache-Control header, a misconfigured proxy or
 * the browser bfcache could retain that response (and the token in it).
 * These tests pin that every route under /api/auth sets
 * `Cache-Control: no-store` on both success and error responses.
 */

jest.mock('bcrypt', () => ({
  compare: jest.fn(async () => false),
  hash: jest.fn(async () => '$2b$12$hashed'),
}));

jest.mock('../db/database', () => ({
  getUserByUsername: jest.fn(),
  getUserById: jest.fn(),
  createUser: jest.fn(),
  updateLastLogin: jest.fn(),
  // Session helpers — the auth routes start a server-side session on success
  // since TODO.md #68, so these must exist even for tests that only care
  // about validation or headers.
  createSession: jest.fn(),
  getSessionById: jest.fn(),
  hasLiveGuestSessionWithDisplayName: jest.fn(() => false),
  revokeSession: jest.fn(() => ({ changes: 1 })),
  revokeSessionsForUser: jest.fn(() => ({ changes: 0 })),
  touchSession: jest.fn(),
  deleteExpiredSessions: jest.fn(() => ({ changes: 0 })),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const express = require('express');
const http = require('http');

const db = require('../db/database');
const authRouter = require('../routes/auth');

let server;
let baseUrl;
let usernameCounter = 0;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

beforeEach(() => {
  jest.clearAllMocks();
  db.getUserByUsername.mockReturnValue(undefined);
});

function register(body) {
  usernameCounter += 1;
  return fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: `user${usernameCounter}`, password: 'secret123', displayName: 'Alice', ...body }),
  });
}

function login(body) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function guest() {
  return fetch(`${baseUrl}/api/auth/guest`, { method: 'POST' });
}

describe('Cache-Control: no-store on /api/auth/*', () => {
  test('successful register sets no-store', async () => {
    const res = await register({});
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  test('register error (invalid username) still sets no-store', async () => {
    const res = await register({ username: 'a' });
    expect(res.status).toBe(400);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  test('successful login sets no-store', async () => {
    db.getUserByUsername.mockReturnValue({
      id: 'user-1', username: 'alice', password_hash: '$2b$12$x', display_name: 'Alice',
    });
    const bcrypt = require('bcrypt');
    bcrypt.compare.mockResolvedValueOnce(true);
    const res = await login({ username: 'alice', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  test('login error (invalid credentials) still sets no-store', async () => {
    const res = await login({ username: 'ghost', password: 'secret123' });
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  test('guest session sets no-store', async () => {
    const res = await guest();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
