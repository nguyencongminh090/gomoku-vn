'use strict';

/**
 * auth-login-input-types.test.js — #352: POST /api/auth/login must answer 400
 * (not 500) when username/password are present but not strings. A JSON object
 * reached better-sqlite3 as a bind parameter and threw RangeError.
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
  createSession: jest.fn(),
  getSessionById: jest.fn(),
  revokeSession: jest.fn(() => ({ changes: 1 })),
  revokeSessionsForUser: jest.fn(() => ({ changes: 0 })),
  touchSession: jest.fn(),
  deleteExpiredSessions: jest.fn(() => ({ changes: 0 })),
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));

const express = require('express');
const http = require('http');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const authRouter = require('../routes/auth');

let server;
let baseUrl;

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

beforeEach(() => jest.clearAllMocks());

function login(body) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login — non-string credentials', () => {
  test.each([
    ['object username', { username: { $ne: null }, password: 'x' }],
    ['array username', { username: ['alice'], password: 'x' }],
    ['number username', { username: 123, password: 'x' }],
    ['object password', { username: 'alice', password: { $ne: null } }],
    ['number password', { username: 'alice', password: 123 }],
  ])('%s → 400 MISSING_CREDENTIALS, no DB lookup, no bcrypt', async (_n, body) => {
    const res = await login(body);

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('MISSING_CREDENTIALS');
    expect(db.getUserByUsername).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });
});
