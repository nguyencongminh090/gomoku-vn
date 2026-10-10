'use strict';

/**
 * puzzles-route.test.js — /api/puzzles (#203): submit/validate, pending cap, review (admin),
 * answers never reach solvers, solving + progress. Real SQL on an in-memory DB.
 */

jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] });

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
// "Session" = raw cookie header = user id ('guest' = guest, absent = logged out).
jest.mock('../utils/session-cookie', () => ({ readSessionIdFromHeader: (h) => h || null }));
jest.mock('../managers/SessionManager', () => ({
  getValidSession: (sid) => ({ userId: sid === 'guest' ? null : sid }),
}));
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
const puzzlesRouter = require('../routes/puzzles');

const NOW = '2026-10-10T00:00:00.000Z';
const db = database.db;
const U = {};
let server, base;

function addUser(name, admin = 0) {
  const id = `${name}-id`;
  U[name] = id;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at, is_admin) VALUES (?, ?, 'x', ?, ?, ?)`)
    .run(id, name, name.toUpperCase(), NOW, admin);
}

function call(method, urlPath, as, body) {
  return new Promise((resolve, reject) => {
    const headers = {};
    if (as) headers.cookie = U[as] || as;
    let payload;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
    }
    const r = http.request(base + urlPath, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

// Black to move; black has an open three on row 8 (H8 I8 J8) — a 3-3 position, 3 black + 3 white.
const stone = (x, y, color) => ({ x, y, color });
const POSITION = [
  stone(7, 7, 'BLACK'), stone(8, 7, 'BLACK'), stone(9, 7, 'BLACK'),
  stone(7, 5, 'WHITE'), stone(8, 5, 'WHITE'), stone(9, 5, 'WHITE'),
];
const good = (over = {}) => ({
  title: 'Mở bốn', prompt: 'Đen đi trước', rule: 'freestyle', toMove: 'BLACK', mode: 'sequence', level: 'easy',
  tags: ['three'], stones: POSITION, answers: [[{ x: 6, y: 7 }], ['K8']], ...over,
});

beforeAll(async () => {
  ['author', 'other', 'solver'].forEach((n) => addUser(n));
  addUser('boss', 1);
  const app = express();
  app.use('/api/puzzles', puzzlesRouter);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

const submit = (as, body) => call('POST', '/api/puzzles', as, body);
const code = (r) => r.body.code;

describe('submit + validation', () => {
  it('a member submits → pending; cells given as {x,y} or text both work', async () => {
    const r = await submit('author', good());
    expect([r.status, r.body.status]).toEqual([201, 'pending']);
    const mine = (await call('GET', '/api/puzzles/mine', 'author')).body.puzzles;
    expect(mine).toHaveLength(1);
    expect(mine[0].answers).toEqual([[{ x: 6, y: 7 }], [{ x: 10, y: 7 }]]); // 'K8' = x 10, y 7
    expect((await call('GET', '/api/puzzles/mine', 'author')).body.canReview).toBe(false);
    expect(mine[0].tags).toEqual(['three']);
  });

  it('guests/logged-out refused', async () => {
    expect((await submit('guest', good())).status).toBe(403);
    expect((await submit(undefined, good())).status).toBe(401);
  });

  it.each([
    ['empty title', { title: '  ' }, 'PUZZLE_TITLE_INVALID'],
    ['long title', { title: 'x'.repeat(61) }, 'PUZZLE_TITLE_INVALID'],
    ['long prompt', { prompt: 'x'.repeat(281) }, 'PUZZLE_PROMPT_INVALID'],
    ['bad rule', { rule: 'renju' }, 'PUZZLE_RULE_INVALID'],
    ['unsupported board size', { boardSize: 16 }, 'PUZZLE_RULE_INVALID'],
    ['bad level', { level: 'insane' }, 'PUZZLE_LEVEL_INVALID'],
    ['no tags', { tags: [] }, 'PUZZLE_TAGS_INVALID'],
    ['unknown tag', { tags: ['nope'] }, 'PUZZLE_TAGS_INVALID'],
    ['4 tags', { tags: ['three', 'vcf', 'vct', 'defense'] }, 'PUZZLE_TAGS_INVALID'],
    ['bad to_move', { toMove: 'RED' }, 'PUZZLE_STONES_INVALID'],
    ['stone counts vs side to move', { toMove: 'WHITE' }, 'PUZZLE_STONES_INVALID'],
    ['overlapping stones', { stones: [...POSITION.slice(0, 5), stone(7, 7, 'WHITE')] }, 'PUZZLE_STONES_INVALID'],
    ['off-board stone', { stones: [...POSITION.slice(0, 5), stone(15, 0, 'WHITE')] }, 'PUZZLE_STONES_INVALID'],
    ['existing five', { stones: [stone(0, 0, 'BLACK'), stone(1, 0, 'BLACK'), stone(2, 0, 'BLACK'), stone(3, 0, 'BLACK'), stone(4, 0, 'BLACK'), stone(0, 14, 'WHITE'), stone(1, 14, 'WHITE'), stone(2, 14, 'WHITE'), stone(3, 14, 'WHITE'), stone(5, 14, 'WHITE')] }, 'PUZZLE_STONES_INVALID'],
    ['no answers', { answers: [] }, 'PUZZLE_ANSWER_INVALID'],
    ['answer on an occupied cell', { answers: [[{ x: 7, y: 7 }]] }, 'PUZZLE_ANSWER_INVALID'],
    ['answer repeats a cell', { answers: [[{ x: 6, y: 7 }, { x: 6, y: 7 }]] }, 'PUZZLE_ANSWER_INVALID'],
    ['bad coordinate text', { answers: [['Z99']] }, 'PUZZLE_ANSWER_INVALID'],
    ['final_move with two moves', { mode: 'final_move', answers: [[{ x: 6, y: 7 }, { x: 10, y: 7 }]] }, 'PUZZLE_ANSWER_INVALID'],
  ])('rejects %s', async (_n, over, expected) => {
    const r = await submit('other', good(over));
    expect([r.status, code(r)]).toEqual([400, expected]);
  });

  it('title/prompt are stored in cleaned wire form (angle brackets escaped)', async () => {
    await submit('solver', good({ title: '<b>x</b>' }));
    const t = (await call('GET', '/api/puzzles/mine', 'solver')).body.puzzles[0].title;
    expect(t).toBe('&lt;b&gt;x&lt;/b&gt;');
    db.prepare("DELETE FROM puzzles WHERE author_id = ?").run(U.solver);
  });

  it('caps pending puzzles at 5 per user; duplicates are accepted (flagged for the reviewer)', async () => {
    addUser('spammer');
    for (let i = 0; i < 5; i++) expect((await submit('spammer', good())).status).toBe(201);
    expect(code(await submit('spammer', good()))).toBe('PUZZLE_PENDING_LIMIT');
  });
});

describe('board sizes + no answer caps (user decision 2026-10-10)', () => {
  it.each([15, 17, 19, 20])('accepts a %i×%i board and stores its size', async (size) => {
    addUser(`sz${size}`);
    const r = await submit(`sz${size}`, good({ boardSize: size }));
    expect(r.status).toBe(201);
    const p = (await call('GET', '/api/puzzles/mine', `sz${size}`)).body.puzzles[0];
    expect(p.boardSize).toBe(size);
  });

  it('cells beyond a smaller board are refused; the same coordinates are fine on a bigger one', async () => {
    addUser('sizer');
    const far = [stone(16, 16, 'BLACK'), stone(1, 1, 'WHITE')]; // (16,16) only exists on 17+
    expect((await submit('sizer', good({ boardSize: 15, stones: far }))).body.code).toBe('PUZZLE_STONES_INVALID');
    expect((await submit('sizer', good({ boardSize: 17, stones: far }))).status).toBe(201);
  });

  it('coordinate text is read against the puzzle’s own size (S19 is the last column on 19×19, T20 on 20×20)', async () => {
    addUser('t19');
    expect((await submit('t19', good({ boardSize: 19, answers: [['S19']] }))).status).toBe(201);
    expect((await submit('t19', good({ boardSize: 19, answers: [['T19']] }))).body.code).toBe('PUZZLE_ANSWER_INVALID');
    expect((await submit('t19', good({ boardSize: 20, answers: [['T20']] }))).status).toBe(201);
    expect((await submit('t19', good({ boardSize: 15, answers: [['P8']] }))).body.code).toBe('PUZZLE_ANSWER_INVALID');
  });

  it('many answers and long answers are accepted (no caps)', async () => {
    addUser('many');
    const cells = [];
    for (let y = 8; y < 15; y++) for (let x = 0; x < 15; x++) cells.push({ x, y });   // 105 empty cells
    const answers = Array.from({ length: 12 }, (_, k) => cells.slice(k, k + 30));      // 12 answers × 30 moves
    expect((await submit('many', good({ answers }))).status).toBe(201);
  });

  it('duplicate positions on different board sizes are not duplicates (hash includes size)', async () => {
    const hashes = db.prepare("SELECT DISTINCT position_hash h FROM puzzles WHERE author_id IN (?, ?)").all(U.sz15, U.sz17);
    expect(hashes).toHaveLength(2);
  });
});

describe('visibility', () => {
  let id;
  beforeAll(async () => { id = (await call('GET', '/api/puzzles/mine', 'author')).body.puzzles[0].id; });

  it('pending: invisible to the public and other members; author and admin see it with answers', async () => {
    expect((await call('GET', `/api/puzzles/${id}`)).status).toBe(404);
    expect((await call('GET', `/api/puzzles/${id}`, 'other')).status).toBe(404);
    expect((await call('GET', '/api/puzzles')).body.puzzles).toEqual([]);
    expect((await call('GET', `/api/puzzles/${id}`, 'author')).body.puzzle.answers).toHaveLength(2);
    expect((await call('GET', `/api/puzzles/${id}`, 'boss')).body.puzzle.answers).toHaveLength(2);
  });
});

describe('review', () => {
  let id;
  beforeAll(async () => { id = (await call('GET', '/api/puzzles/mine', 'author')).body.puzzles[0].id; });
  const decide = (as, body, pid) => call('POST', `/api/puzzles/${pid || id}/review`, as, body);

  it('only admins read the queue or decide; the queue flags duplicate positions', async () => {
    expect((await call('GET', '/api/puzzles/review', 'author')).status).toBe(403);
    expect((await decide('author', { decision: 'approve' })).status).toBe(403);
    expect((await call('GET', '/api/puzzles/review', 'guest')).status).toBe(403);
    const q = (await call('GET', '/api/puzzles/review', 'boss')).body;
    expect(q.pagination.total).toBeGreaterThan(5);
    expect(q.puzzles.find((p) => p.id === id).duplicates).toBeGreaterThan(0); // spammer's identical positions
  });

  it('reject needs a note; bad decision/level refused; pending only', async () => {
    expect(code(await decide('boss', { decision: 'reject' }))).toBe('PUZZLE_DECISION_INVALID');
    expect(code(await decide('boss', { decision: 'maybe' }))).toBe('PUZZLE_DECISION_INVALID');
    expect(code(await decide('boss', { decision: 'approve', level: 'godlike' }))).toBe('PUZZLE_LEVEL_INVALID');
    expect((await decide('boss', { decision: 'approve' }, 'nope')).status).toBe(404);
  });

  it('approve sets the reviewer’s level and publishes it; the list shows it without answers', async () => {
    expect((await decide('boss', { decision: 'approve', level: 'hard' })).body.status).toBe('approved');
    expect((await decide('boss', { decision: 'approve' })).body.code).toBe('PUZZLE_NOT_PENDING');
    const pub = (await call('GET', '/api/puzzles')).body.puzzles;
    expect(pub).toHaveLength(1);
    expect(pub[0]).toMatchObject({ id, level: 'hard', tags: ['three'] });
    expect(pub[0].answers).toBeUndefined();
    expect(pub[0].stones).toBeUndefined(); // the list carries no board
    const one = (await call('GET', `/api/puzzles/${id}`)).body.puzzle;
    expect(one.answers).toBeUndefined();
    expect(one.stones).toHaveLength(6);
  });

  it('reject records the note for the author', async () => {
    const mine = (await call('GET', '/api/puzzles/mine', 'spammer')).body.puzzles;
    await decide('boss', { decision: 'reject', note: 'Trùng thế cờ' }, mine[0].id);
    const after = (await call('GET', '/api/puzzles/mine', 'spammer')).body.puzzles.find((p) => p.id === mine[0].id);
    expect([after.status, after.reviewNote]).toEqual(['rejected', 'Trùng thế cờ']);
  });
});

describe('list filters', () => {
  it('filters by tag / level / rule; unknown filter values are ignored', async () => {
    expect((await call('GET', '/api/puzzles?tag=three&level=hard&rule=freestyle')).body.puzzles).toHaveLength(1);
    expect((await call('GET', '/api/puzzles?tag=vcf')).body.puzzles).toHaveLength(0);
    expect((await call('GET', '/api/puzzles?level=easy')).body.puzzles).toHaveLength(0);
    expect((await call('GET', '/api/puzzles?rule=caro')).body.puzzles).toHaveLength(0);
    expect((await call('GET', '/api/puzzles?tag=bogus')).body.puzzles).toHaveLength(1);
  });
  it('GET /meta lists the allowed values', async () => {
    const m = (await call('GET', '/api/puzzles/meta')).body;
    expect(m.levels).toEqual(['easy', 'medium', 'hard', 'expert']);
    expect(m.rules).toEqual(['freestyle', 'standard', 'caro']);
  });
});

describe('solving', () => {
  let id;
  beforeAll(async () => { id = (await call('GET', '/api/puzzles')).body.puzzles[0].id; });
  const solve = (as, moves) => call('POST', `/api/puzzles/${id}/solve`, as, { moves });

  it('any one accepted answer solves; wrong/extra/out-of-order moves do not; text and {x,y} both accepted', async () => {
    expect((await solve('solver', [{ x: 6, y: 7 }])).body.correct).toBe(true);
    expect((await solve('solver', ['K8'])).body.correct).toBe(true);        // second accepted answer
    expect((await solve('solver', ['122'])).body.correct).toBe(false);
    expect((await solve('solver', [{ x: 6, y: 7 }, { x: 10, y: 7 }])).body.correct).toBe(false);
  });

  it('bad input and missing puzzles are refused; guests cannot solve', async () => {
    expect(code(await solve('solver', []))).toBe('PUZZLE_MOVES_INVALID');
    expect(code(await solve('solver', ['Z99']))).toBe('PUZZLE_MOVES_INVALID');
    expect(code(await solve('solver', 'H8'))).toBe('PUZZLE_MOVES_INVALID');
    expect((await solve('guest', ['K8'])).status).toBe(403);
    expect((await call('POST', '/api/puzzles/nope/solve', 'solver', { moves: ['K8'] })).status).toBe(404);
  });

  it('records attempts and the first solve; list/detail show solved for that viewer only', async () => {
    const row = db.prepare('SELECT attempts, solved_at FROM puzzle_progress WHERE user_id = ? AND puzzle_id = ?').get(U.solver, id);
    expect(row.attempts).toBe(4);
    expect(row.solved_at).toBeTruthy();
    expect((await call('GET', '/api/puzzles', 'solver')).body.puzzles[0].solved).toBe(true);
    expect((await call('GET', '/api/puzzles', 'other')).body.puzzles[0].solved).toBe(false);
    expect((await call('GET', '/api/puzzles')).body.puzzles[0].solved).toBeUndefined();
    expect((await call('GET', `/api/puzzles/${id}`, 'solver')).body.puzzle.solved).toBe(true);
  });

  it('final_move puzzles take exactly one move', async () => {
    const r = await submit('other', good({ mode: 'final_move', answers: [['H9'], ['K8']] }));
    const pid = r.body.id;
    await call('POST', `/api/puzzles/${pid}/review`, 'boss', { decision: 'approve' });
    const s = (m) => call('POST', `/api/puzzles/${pid}/solve`, 'solver', { moves: m });
    expect((await s(['K8'])).body.correct).toBe(true);
    expect((await s(['H8', 'K8'])).body.correct).toBe(false);
  });
});

describe('editing', () => {
  it('only the author edits; editing an approved puzzle returns it to pending and clears solves', async () => {
    const id = (await call('GET', '/api/puzzles?level=hard')).body.puzzles[0].id;
    expect((await call('PUT', `/api/puzzles/${id}`, 'other', good())).body.code).toBe('PUZZLE_FORBIDDEN');
    expect((await call('PUT', `/api/puzzles/${id}`, 'author', good({ title: 'Mở bốn v2', level: 'medium' }))).body.status).toBe('pending');
    expect((await call('GET', '/api/puzzles?level=hard')).body.puzzles).toHaveLength(0);
    expect(db.prepare('SELECT COUNT(*) n FROM puzzle_progress WHERE puzzle_id = ?').get(id).n).toBe(0);
    expect((await call('PUT', '/api/puzzles/nope', 'author', good())).status).toBe(404);
  });
});
