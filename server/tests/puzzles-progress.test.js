'use strict';

/**
 * puzzles-progress.test.js — #508 Training path data: GET /api/puzzles/progress (per-level totals, my solved
 * counts, next unsolved), `position` on GET /:id ("bài N trên M", same order as the list), `counts` on /mine.
 * Read-only additions; real SQL on a fresh in-memory DB.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../utils/session-cookie', () => ({ readSessionIdFromHeader: (h) => h || null }));
jest.mock('../managers/SessionManager', () => ({
  getValidSession: (sid) => ({ userId: sid === 'guest' ? null : sid }),
}));
jest.mock('../middleware/auth', () => ({
  verifyToken: (req, res, next) => {
    if (!req.headers.cookie) return res.status(401).json({ code: 'AUTH_REQUIRED' });
    req.user = { userId: req.headers.cookie === 'guest' ? 'guest_abc' : req.headers.cookie, isGuest: req.headers.cookie === 'guest' };
    next();
  },
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const puzzlesRouter = require('../routes/puzzles');

const NOW = Date.parse('2026-10-10T00:00:00.000Z');
const db = database.db;
let server, base;

function addUser(id) {
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at, role) VALUES (?, ?, 'x', ?, ?, 'member')`)
    .run(id, id, id.toUpperCase(), new Date(NOW).toISOString());
}

let seq = 0;
/** Insert a puzzle; `i` orders created_at (higher = newer). */
function addPuzzle(id, { level = 'easy', rule = 'freestyle', status = 'approved', author = 'author', tags = [] } = {}) {
  seq += 1;
  const at = new Date(NOW + seq * 1000).toISOString();
  db.prepare(`INSERT INTO puzzles (id, number, author_id, title, prompt, rule, board_size, stones, layout, to_move, mode, answers, level, position_hash, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'p', ?, 15, '[]', '{}', 'BLACK', 'sequence', '[]', ?, ?, ?, ?, ?)`)
    .run(id, seq, author, id.toUpperCase(), rule, level, 'h' + id, status, at, at);
  for (const t of tags) db.prepare('INSERT INTO puzzle_tags (puzzle_id, tag) VALUES (?, ?)').run(id, t);
}
const solveRow = (user, pid) => db.prepare("INSERT INTO puzzle_progress (user_id, puzzle_id, attempts, solved_at) VALUES (?, ?, 1, '2026-10-11T00:00:00.000Z')").run(user, pid);

function call(urlPath, as) {
  return new Promise((resolve, reject) => {
    const headers = as ? { cookie: as } : {};
    http.get(base + urlPath, { headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    }).on('error', reject);
  });
}

beforeAll(async () => {
  ['author', 'solver', 'fresh'].forEach(addUser);
  // easy: e1 (oldest) … e3 (newest); medium: m1, m2 (renju); hard: none approved; expert: x1.
  addPuzzle('e1', { tags: ['attack'] });
  addPuzzle('e2');
  addPuzzle('e3', { tags: ['attack'] });
  addPuzzle('m1', { level: 'medium' });
  addPuzzle('m2', { level: 'medium', rule: 'renju' });
  addPuzzle('hp', { level: 'hard', status: 'pending' });
  addPuzzle('hr', { level: 'hard', status: 'rejected' });
  addPuzzle('x1', { level: 'expert' });
  solveRow('solver', 'e3');
  solveRow('solver', 'e2');
  solveRow('solver', 'hp'); // a solve on a non-approved puzzle never counts
  db.prepare("INSERT INTO puzzle_progress (user_id, puzzle_id, attempts, solved_at) VALUES ('solver', 'm1', 3, NULL)").run(); // tried, not solved
  const app = express();
  app.use('/api/puzzles', puzzlesRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

describe('GET /api/puzzles/progress', () => {
  it('guest: approved totals per level, no solved counts, next = newest of each level (list order)', async () => {
    const r = await call('/api/puzzles/progress');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(6);
    expect(r.body.solved).toBeNull();
    expect(r.body.levels).toEqual({
      easy: { total: 3, solved: null, nextId: 'e3' },
      medium: { total: 2, solved: null, nextId: 'm2' },
      hard: { total: 0, solved: null, nextId: null },
      expert: { total: 1, solved: null, nextId: 'x1' },
    });
  });

  it('member: solved counts approved puzzles only; nextId skips solved ones, in list order', async () => {
    const r = (await call('/api/puzzles/progress', 'solver')).body;
    expect(r.solved).toBe(2);
    expect(r.levels.easy).toEqual({ total: 3, solved: 2, nextId: 'e1' });
    expect(r.levels.medium).toEqual({ total: 2, solved: 0, nextId: 'm2' }); // a try without a solve is not solved
    expect(r.levels.hard).toEqual({ total: 0, solved: 0, nextId: null });
  });

  it('a level with everything solved has nextId null', async () => {
    addUser('done');
    ['e1', 'e2', 'e3'].forEach((p) => solveRow('done', p));
    expect((await call('/api/puzzles/progress', 'done')).body.levels.easy).toEqual({ total: 3, solved: 3, nextId: null });
  });

  it('applies the same rule/tag filters as the list; unknown values are ignored', async () => {
    const byRule = (await call('/api/puzzles/progress?rule=renju', 'solver')).body;
    expect(byRule.total).toBe(1);
    expect(byRule.levels.medium).toEqual({ total: 1, solved: 0, nextId: 'm2' });
    expect(byRule.levels.easy.total).toBe(0);
    const byTag = (await call('/api/puzzles/progress?tag=attack', 'solver')).body;
    expect(byTag.levels.easy).toEqual({ total: 2, solved: 1, nextId: 'e1' });
    expect(byTag.solved).toBe(1);
    expect((await call('/api/puzzles/progress?rule=bogus')).body.total).toBe(6);
  });

  it('is not swallowed by GET /:id', async () => {
    const r = await call('/api/puzzles/progress');
    expect(r.body.puzzle).toBeUndefined();
  });
});

describe('position on GET /api/puzzles/:id', () => {
  it('index/total within the level, counted in list order (newest = 1); first and last', async () => {
    const list = (await call('/api/puzzles?level=easy')).body.puzzles.map((p) => p.id);
    expect(list).toEqual(['e3', 'e2', 'e1']);
    expect((await call('/api/puzzles/e3')).body.puzzle.position).toMatchObject({ index: 1, total: 3 });
    expect((await call('/api/puzzles/e1')).body.puzzle.position).toMatchObject({ index: 3, total: 3 });
    expect((await call('/api/puzzles/x1')).body.puzzle.position).toMatchObject({ index: 1, total: 1 });
  });

  it('nextId = the next unsolved puzzle after this one in the level, wrapping; null when none', async () => {
    expect((await call('/api/puzzles/e3', 'solver')).body.puzzle.position.nextId).toBe('e1'); // e2 solved
    expect((await call('/api/puzzles/e1', 'solver')).body.puzzle.position.nextId).toBeNull(); // only itself left
    expect((await call('/api/puzzles/e1')).body.puzzle.position.nextId).toBe('e3'); // guest: wraps
    expect((await call('/api/puzzles/x1')).body.puzzle.position.nextId).toBeNull();
  });

  it('non-approved puzzles (author view) carry no position', async () => {
    expect((await call('/api/puzzles/hp', 'author')).body.puzzle.position).toBeUndefined();
  });
});

describe('counts on GET /api/puzzles/mine', () => {
  it('counts every puzzle of mine by status, across pages', async () => {
    const r = (await call('/api/puzzles/mine', 'author')).body;
    expect(r.counts).toEqual({ pending: 1, approved: 6, rejected: 1 });
    expect((await call('/api/puzzles/mine', 'fresh')).body.counts).toEqual({ pending: 0, approved: 0, rejected: 0 });
  });
});
