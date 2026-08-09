'use strict';

/**
 * auth-error-codes.test.js — Unit tests for the `code` field on
 * POST /api/auth/{register,login} error responses (TODO.md #45).
 *
 * Root cause of #45: the client showed `data.error` (always Vietnamese)
 * straight to the user, so the i18n fallback in login.js never ran even in
 * English mode. The fix adds a language-neutral `code` alongside the existing
 * Vietnamese `error` string; the client now maps `code` to an i18n key
 * instead. These tests pin that every error branch carries the right code,
 * and that the Vietnamese `error` string is left untouched for logs/back-
 * compat.
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

describe('POST /api/auth/register — error codes', () => {
  test('invalid username → USERNAME_INVALID, Vietnamese error kept', async () => {
    const res = await register({ username: 'a' });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe('USERNAME_INVALID');
    expect(body.error).toMatch(/Tên đăng nhập/);
  });

  test('invalid display name → DISPLAY_NAME_INVALID', async () => {
    const res = await register({ displayName: 'a' });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe('DISPLAY_NAME_INVALID');
  });

  test('short password → PASSWORD_TOO_SHORT', async () => {
    const res = await register({ password: '123' });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe('PASSWORD_TOO_SHORT');
  });

  test('duplicate username → USERNAME_TAKEN', async () => {
    db.getUserByUsername.mockReturnValue({ id: 'existing' });
    const res = await register({});
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.code).toBe('USERNAME_TAKEN');
  });

  test('successful register response has no error code', async () => {
    const res = await register({});
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.code).toBeUndefined();
  });
});

describe('POST /api/auth/login — error codes', () => {
  test('missing username → MISSING_CREDENTIALS', async () => {
    const res = await login({ password: 'secret123' });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe('MISSING_CREDENTIALS');
  });

  test('missing password → MISSING_CREDENTIALS', async () => {
    const res = await login({ username: 'alice' });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.code).toBe('MISSING_CREDENTIALS');
  });

  test('unknown username → INVALID_CREDENTIALS (not USERNAME_TAKEN-style leak)', async () => {
    db.getUserByUsername.mockReturnValue(undefined);
    const res = await login({ username: 'ghost', password: 'secret123' });
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.code).toBe('INVALID_CREDENTIALS');
  });

  test('wrong password → INVALID_CREDENTIALS', async () => {
    db.getUserByUsername.mockReturnValue({
      id: 'user-1', username: 'alice', password_hash: '$2b$12$x', display_name: 'Alice',
    });
    const res = await login({ username: 'alice', password: 'wrongpass' });
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.code).toBe('INVALID_CREDENTIALS');
  });
});
