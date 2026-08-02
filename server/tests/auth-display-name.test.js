'use strict';

/**
 * auth-display-name.test.js — Unit tests for the display-name character
 * restriction on POST /api/auth/register (TODO Phần B #32, instruction.md §B32).
 *
 * This is defence in depth, not a patch for an open hole: the audit confirmed
 * every client render path already escapes before touching `innerHTML`. What
 * these tests pin is that the *source* now rejects the HTML/JS-significant
 * characters too — and, just as importantly, that it does **not** reject real
 * Vietnamese names. instruction.md §B32 calls out that regression by name: an
 * ASCII allow-list would lock most of this app's users out of their own name,
 * so the accept-side cases below are as load-bearing as the reject-side ones.
 *
 * Driven through the real route (not an exported helper) because
 * `isValidDisplayName` is module-private and the route is what actually gates
 * what reaches the database.
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

// This file needs ~30 register calls from one IP to cover the character
// matrix, which is more than `authLimiter`'s 20-per-15-minutes budget. The
// limiter is stubbed out **here in the test only** — production code keeps its
// real threshold (instruction.md is explicit that the limiter must not be
// loosened in shipped code just to make testing easier), and the limiter's own
// behaviour is covered by `games-route.test.js`.
jest.mock('express-rate-limit', () => () => (req, res, next) => next());

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

/**
 * Register with the given display name. Each call uses a fresh username so the
 * uniqueness check never short-circuits the display-name check we care about.
 */
function register(displayName) {
  usernameCounter += 1;
  return fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: `user${usernameCounter}`,
      password: 'secret123',
      displayName,
    }),
  });
}

describe('POST /api/auth/register — display name accepts real names', () => {
  // The regression instruction.md §B32 warns about. If any of these start
  // failing, users cannot register under their own name.
  const accepted = [
    ['a plain ASCII name', 'Alice'],
    ['an accented Vietnamese name', 'Nguyễn Văn A'],
    ['a longer Vietnamese name with spaces', 'Trần Thị Bích Ngọc'],
    ['a name with Latin-1 accents', 'Émile Zola'],
    ['a non-Latin script', '日本語'],
    ['the shortest allowed name', 'AB'],
    ['the longest allowed name', 'x'.repeat(24)],
    ['a name needing trimming to fit', `  ${'y'.repeat(24)}  `],
    ['digits and punctuation that are not HTML-significant', 'Player_42 (v2)'],
  ];

  test.each(accepted)('accepts %s', async (_label, displayName) => {
    const res = await register(displayName);

    expect(res.status).toBe(201);
    expect(db.createUser).toHaveBeenCalledTimes(1);
    expect(db.createUser.mock.calls[0][0].displayName).toBe(displayName.trim());
  });
});

describe('POST /api/auth/register — display name rejects unsafe characters', () => {
  const rejected = [
    ['an angle bracket / tag payload', '<script>alert(1)</script>'],
    ['a bare less-than', 'a<b'],
    ['a bare greater-than', 'a>b'],
    ['an ampersand (entity smuggling)', 'R&D team'],
    ['a double quote (attribute break-out)', 'say "hi"'],
    ['a single quote (JS-string break-out)', "onclick='x'"],
    ['an img/onerror payload', '<img src=x onerror=alert(1)>'],
    ['a newline', 'line1\nline2'],
    ['a carriage return', 'line1\rline2'],
    ['a tab', 'a\tb'],
    ['a NUL byte', 'a\u0000b'],
    ['a C1 control character', 'a\u0085b'],
  ];

  test.each(rejected)('rejects %s', async (_label, displayName) => {
    const res = await register(displayName);

    expect(res.status).toBe(400);
    expect(db.createUser).not.toHaveBeenCalled();
  });

  test('still rejects on length alone, as before', async () => {
    expect((await register('a')).status).toBe(400);
    expect((await register('x'.repeat(25))).status).toBe(400);
    expect(db.createUser).not.toHaveBeenCalled();
  });

  test('rejects a non-string display name', async () => {
    usernameCounter += 1;
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: `user${usernameCounter}`,
        password: 'secret123',
        displayName: 12345,
      }),
    });

    expect(res.status).toBe(400);
    expect(db.createUser).not.toHaveBeenCalled();
  });

  test('the rejection message names the character rule, not just the length', async () => {
    const res = await register('<script>');
    const body = await res.json();

    // A message that only mentions "2-24 ký tự" would leave a user staring at
    // a name that is already the right length, with no idea what is wrong.
    expect(body.error).toMatch(/ký tự/);
    expect(body.error).toMatch(/[<>&]/);
  });

  test('a rejected name never reaches the database, even hashed', async () => {
    const bcrypt = require('bcrypt');
    await register('<script>alert(1)</script>');

    expect(db.createUser).not.toHaveBeenCalled();
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });
});
