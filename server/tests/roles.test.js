'use strict';

/**
 * roles.test.js — staff roles (R8 #205): helper, access matrix on both queues, /api/admin/me,
 * and the one-time is_admin → role carry-over. Real SQL, in-memory DB.
 */

let mockNextDb = null; // the migration test hands database.js a pre-built old-schema DB
jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return mockNextDb || new Actual(':memory:'); };
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
const database = require('../db/database');
const roles = require('../utils/roles');
const adminRouter = require('../routes/admin');
const forumRouter = require('../routes/forum');
const puzzlesRouter = require('../routes/puzzles');

const db = database.db;
let server, base;

function add(id, role) {
  db.prepare("INSERT INTO users (id, username, password_hash, display_name, created_at, role) VALUES (?, ?, 'x', ?, ?, ?)")
    .run(id, id, id, '2026-10-10T00:00:00.000Z', role);
}

const get = (p, as) => fetch(base + p, { headers: as ? { cookie: as } : {} }).then(async (r) => ({ status: r.status, body: await r.json() }));

beforeAll(async () => {
  add('mem', 'member'); add('mod', 'moderator'); add('adm', 'admin'); add('weird', 'superuser');
  const app = express();
  app.use('/api/admin', adminRouter);
  app.use('/api/forum', forumRouter);
  app.use('/api/puzzles', puzzlesRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

describe('roles helper', () => {
  it.each([['mem', 'member'], ['mod', 'moderator'], ['adm', 'admin'], ['weird', 'member'], ['nobody', 'member'], [null, 'member'], [undefined, 'member']])('roleOf(%s) = %s', (id, role) => {
    expect(roles.roleOf(id)).toBe(role);
  });

  it.each([
    ['mem', false], ['mod', true], ['adm', true], ['weird', false], [null, false],
  ])('%s may review puzzles / moderate forum: %s', (id, allowed) => {
    expect(roles.can(id, 'puzzle.review')).toBe(allowed);
    expect(roles.can(id, 'forum.moderate')).toBe(allowed);
  });

  it('an unknown permission is denied for everyone', () => {
    expect(roles.can('adm', 'nope')).toBe(false);
  });
});

describe('access matrix on the two queues', () => {
  it.each([['mem', 403], ['mod', 200], ['adm', 200]])('%s → puzzle review queue %i', async (id, status) => {
    expect((await get('/api/puzzles/review', id)).status).toBe(status);
  });
  it.each([['mem', 403], ['mod', 200], ['adm', 200]])('%s → forum reports %i', async (id, status) => {
    expect((await get('/api/forum/reports', id)).status).toBe(status);
  });
  it('a guest gets 403 and no cookie 401', async () => {
    expect((await get('/api/puzzles/review', 'guest')).status).toBe(403);
    expect((await get('/api/forum/reports')).status).toBe(401);
  });
});

describe('GET /api/admin/me', () => {
  it.each([
    ['mem', 'member', []],
    ['mod', 'moderator', ['puzzle.review', 'forum.moderate', 'admin.access', 'cheat.review']],
    ['adm', 'admin', ['puzzle.review', 'forum.moderate', 'admin.access', 'cheat.review', 'user.manage']],
  ])('%s → role %s', async (id, role, permissions) => {
    const r = await get('/api/admin/me', id);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ role, permissions });
  });
  it('guest 403, anonymous 401', async () => {
    expect((await get('/api/admin/me', 'guest')).status).toBe(403);
    expect((await get('/api/admin/me')).status).toBe(401);
  });
});

describe('migration', () => {
  it('the role column exists and defaults to member', () => {
    const col = db.prepare('PRAGMA table_info(users)').all().find((c) => c.name === 'role');
    expect(col).toBeTruthy();
    expect(col.dflt_value).toBe("'member'");
  });

  it('carries is_admin = 1 over to role admin once, on an old database', () => {
    jest.isolateModules(() => {
      const Actual = jest.requireActual('better-sqlite3');
      const old = new Actual(':memory:');
      old.exec("CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, password_hash TEXT, display_name TEXT, created_at TEXT, is_admin INTEGER NOT NULL DEFAULT 0)");
      old.prepare("INSERT INTO users VALUES ('a','a','x','a','t',1), ('b','b','x','b','t',0)").run();
      mockNextDb = old;
      require('../db/database');
      const rows = Object.fromEntries(old.prepare('SELECT id, role FROM users').all().map((r) => [r.id, r.role]));
      mockNextDb = null;
      expect(rows).toEqual({ a: 'admin', b: 'member' });
    });
  });
});
