'use strict';

/**
 * auth-login-timing.test.js — Unit tests for POST /api/auth/login's
 * timing-attack defence (review 3.6).
 *
 * These assert **code-path symmetry**, not wall-clock time: that exactly one
 * bcrypt.compare runs whether or not the account exists, and that the fixed
 * dummy hash carries the same cost factor as real password hashes. Wall-clock
 * behaviour is measured separately against a live server (see the fix-log row
 * and TODO Phần A #4) — a Jest assertion on elapsed time would be flaky and
 * would prove nothing about a real deployment.
 *
 * bcrypt is mocked so the suite stays fast; the real module is only used to
 * read the cost factor out of the hash string.
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
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');

const bcrypt = require('bcrypt');
const db = require('../db/database');
const config = require('../config');
const authRouter = require('../routes/auth');

const EXISTING_USER = {
  id: 'user-1',
  username: 'alice',
  password_hash: '$2b$12$storedhashforalice',
  display_name: 'Alice',
};

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

beforeEach(() => {
  jest.clearAllMocks();
  bcrypt.compare.mockImplementation(async () => false);
});

function login(body) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/login — timing symmetry', () => {
  test('an unknown username still runs exactly one bcrypt.compare', async () => {
    db.getUserByUsername.mockReturnValue(undefined);

    const res = await login({ username: 'nobody', password: 'secret' });

    expect(res.status).toBe(401);
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  test('a known username with a wrong password runs exactly one bcrypt.compare', async () => {
    db.getUserByUsername.mockReturnValue(EXISTING_USER);

    const res = await login({ username: 'alice', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  test('the unknown-user compare uses a fixed dummy hash, not the submitted data', async () => {
    db.getUserByUsername.mockReturnValue(undefined);
    await login({ username: 'nobody', password: 'secret' });

    const [password, hash] = bcrypt.compare.mock.calls[0];
    expect(password).toBe('secret');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);          // a real bcrypt hash
    expect(hash).not.toBe(EXISTING_USER.password_hash);
  });

  test('the dummy hash is stable across calls (it is a constant, not generated per request)', async () => {
    db.getUserByUsername.mockReturnValue(undefined);

    await login({ username: 'nobody', password: 'a' });
    await login({ username: 'someone-else', password: 'b' });

    expect(bcrypt.compare.mock.calls[0][1]).toBe(bcrypt.compare.mock.calls[1][1]);
  });

  test('both failure modes return the identical response', async () => {
    db.getUserByUsername.mockReturnValue(undefined);
    const unknown = await login({ username: 'nobody', password: 'secret' });
    const unknownBody = await unknown.json();

    db.getUserByUsername.mockReturnValue(EXISTING_USER);
    const wrongPw = await login({ username: 'alice', password: 'wrong' });
    const wrongPwBody = await wrongPw.json();

    expect(unknown.status).toBe(wrongPw.status);
    expect(unknownBody).toEqual(wrongPwBody);
  });

  test('a correct password for an existing user still logs in', async () => {
    db.getUserByUsername.mockReturnValue(EXISTING_USER);
    bcrypt.compare.mockImplementation(async () => true);

    const res = await login({ username: 'alice', password: 'right' });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.displayName).toBe('Alice');
    expect(db.updateLastLogin).toHaveBeenCalledTimes(1);
  });

  test('a missing username/password is still rejected before any hashing', async () => {
    const res = await login({ username: 'alice' });

    expect(res.status).toBe(400);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });
});

describe('the dummy hash constant', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'routes', 'auth.js'),
    'utf8'
  );

  test('is hardcoded in the source, not computed at startup', () => {
    // instruction.md §B6 is explicit that the dummy hash must be a fixed
    // constant: a runtime-generated one can cost a different amount to compare
    // against, which is the variance this defence exists to remove.
    expect(source).toMatch(/const DUMMY_PASSWORD_HASH = '\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}';/);
    expect(source).not.toMatch(/DUMMY_PASSWORD_HASH\s*=\s*(await\s+)?bcrypt\.hash/);
  });

  test('carries the same cost factor as real password hashes', () => {
    // A cheaper dummy would finish faster than a real compare and hand the
    // timing signal straight back.
    const match = source.match(/const DUMMY_PASSWORD_HASH = '\$2[aby]\$(\d{2})\$/);
    expect(match).not.toBeNull();
    expect(Number(match[1])).toBe(config.BCRYPT_ROUNDS);
  });
});
