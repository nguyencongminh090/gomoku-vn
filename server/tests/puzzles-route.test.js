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
    req.user = { userId: req.headers.cookie === 'guest' ? 'guest_abc' : req.headers.cookie, isGuest: req.headers.cookie === 'guest' };
    next();
  },
}));

const express = require('express');
const http = require('http');
const database = require('../db/database');
const puzzlesRouter = require('../routes/puzzles');
const dmText = require('../managers/DmText');

const NOW = '2026-10-10T00:00:00.000Z';
const db = database.db;
const U = {};
let server, base;

function addUser(name, role = 'member') {
  const id = `${name}-id`;
  U[name] = id;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at, role) VALUES (?, ?, 'x', ?, ?, ?)`)
    .run(id, name, name.toUpperCase(), NOW, role);
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
  tags: ['attack'], stones: POSITION, answers: [[{ x: 6, y: 7 }], ['K8']], ...over,
});

beforeAll(async () => {
  ['author', 'other', 'solver'].forEach((n) => addUser(n));
  addUser('boss', 'admin');
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
    expect(mine[0].tags).toEqual(['attack']);
  });

  it('guests/logged-out refused', async () => {
    expect((await submit('guest', good())).status).toBe(403);
    expect((await submit(undefined, good())).status).toBe(401);
    // #273: a real guest session carries a `guest_…` userId + isGuest — it used to pass the guard and hit an FK 500.
    const g = await submit('guest', good());
    expect(g.body.code).toBe('GUEST_FORBIDDEN');
    expect((await call('GET', '/api/puzzles/mine', 'guest')).status).toBe(403);
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
    ['4 tags', { tags: ['attack', 'vcf', 'vct', 'defense'] }, 'PUZZLE_TAGS_INVALID'],
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
    expect(pub[0]).toMatchObject({ id, level: 'hard', tags: ['attack'] });
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
  const progressCount = (id) => db.prepare('SELECT COUNT(*) n FROM puzzle_progress WHERE puzzle_id = ?').get(id).n;
  let id;
  beforeAll(async () => { id = (await call('GET', '/api/puzzles?level=hard')).body.puzzles[0].id; });

  it('only the author edits; 404 for a missing puzzle', async () => {
    expect((await call('PUT', `/api/puzzles/${id}`, 'other', good())).body.code).toBe('PUZZLE_FORBIDDEN');
    expect((await call('PUT', '/api/puzzles/nope', 'author', good())).status).toBe(404);
  });

  it('#332: a text/level edit returns it to pending but keeps solves and attempts', async () => {
    expect(progressCount(id)).toBeGreaterThan(0);
    const attempts = db.prepare('SELECT COUNT(*) n FROM puzzle_attempts WHERE puzzle_id = ?').get(id).n;
    expect((await call('PUT', `/api/puzzles/${id}`, 'author', good({ title: 'Mở bốn v2', level: 'medium' }))).body.status).toBe('pending');
    expect((await call('GET', '/api/puzzles?level=hard')).body.puzzles).toHaveLength(0);
    expect(progressCount(id)).toBeGreaterThan(0);
    expect(db.prepare('SELECT COUNT(*) n FROM puzzle_attempts WHERE puzzle_id = ?').get(id).n).toBe(attempts);
  });

  it('#332: changing stones or answers clears solves and attempts of an approved puzzle', async () => {
    await call('POST', `/api/puzzles/${id}/review`, 'boss', { decision: 'approve' });
    const answersOnly = await call('PUT', `/api/puzzles/${id}`, 'author', good({ answers: [['K8']] }));
    expect(answersOnly.body.status).toBe('pending');
    expect(progressCount(id)).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM puzzle_attempts WHERE puzzle_id = ?').get(id).n).toBe(0);
  });

  it('#332: re-saving identical position/answers (even with moved stone order) keeps solves', async () => {
    await call('POST', `/api/puzzles/${id}/review`, 'boss', { decision: 'approve' });
    await call('POST', `/api/puzzles/${id}/solve`, 'solver', { moves: ['K8'] });
    await call('PUT', `/api/puzzles/${id}`, 'author', good({ answers: [['K8']], stones: [...POSITION].reverse(), tags: ['defense'] }));
    expect(progressCount(id)).toBe(1);
  });

  it('#338: a position edit made while still pending clears solves kept from the approved version', async () => {
    await call('POST', `/api/puzzles/${id}/review`, 'boss', { decision: 'approve' });
    await call('POST', `/api/puzzles/${id}/solve`, 'solver', { moves: ['K8'] });
    expect((await call('PUT', `/api/puzzles/${id}`, 'author', good({ answers: [['K8']], title: 'Chỉ đổi chữ' }))).body.status).toBe('pending');
    expect(progressCount(id)).toBe(1); // text-only edit keeps them (#332)
    await call('PUT', `/api/puzzles/${id}`, 'author', good({ answers: [[{ x: 6, y: 7 }]] })); // now the position/answers change, still pending
    expect(progressCount(id)).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM puzzle_attempts WHERE puzzle_id = ?').get(id).n).toBe(0);
  });
});

describe('#333 puzzle number', () => {
  it('numbers are sequential, shown in the list and detail, and a number resolves like the id', async () => {
    const list = (await call('GET', '/api/puzzles')).body.puzzles;
    expect(list.every((p) => Number.isInteger(p.number) && p.number >= 1)).toBe(true);
    const nums = db.prepare('SELECT number FROM puzzles ORDER BY number').all().map((r) => r.number);
    expect(nums).toEqual([...new Set(nums)]); // ascending and unique; deletes may leave gaps
    const p = list[0];
    const byNum = await call('GET', `/api/puzzles/${p.number}`);
    expect(byNum.body.puzzle.id).toBe(p.id);
    expect(byNum.body.puzzle.number).toBe(p.number);
    expect((await call('GET', '/api/puzzles/987654')).status).toBe(404);
  });

  it('a new puzzle gets max+1 even when earlier ones were rejected; the UUID id is unchanged', async () => {
    const before = db.prepare('SELECT MAX(number) m FROM puzzles').get().m;
    const r = await submit('solver', good());
    expect(db.prepare('SELECT number FROM puzzles WHERE id = ?').get(r.body.id).number).toBe(before + 1);
    expect(r.body.id).toMatch(/-/);
    await call('POST', `/api/puzzles/${r.body.id}/review`, 'boss', { decision: 'reject', note: 'x' });
    const r2 = await submit('solver', good());
    expect(db.prepare('SELECT number FROM puzzles WHERE id = ?').get(r2.body.id).number).toBe(before + 2);
  });
});

describe('#334 rename', () => {
  let id;
  beforeAll(async () => {
    id = (await submit('author', good({ title: 'Cũ' }))).body.id;
    await call('POST', `/api/puzzles/${id}/review`, 'boss', { decision: 'approve' });
    await call('POST', `/api/puzzles/${id}/solve`, 'solver', { moves: ['K8'] });
  });
  const rename = (as, title) => call('PATCH', `/api/puzzles/${id}/title`, as, { title });

  it('the author renames an approved puzzle: status and solves stay', async () => {
    expect((await rename('author', 'Mới <b>')).status).toBe(200);
    const row = db.prepare('SELECT title, status FROM puzzles WHERE id = ?').get(id);
    expect(row.status).toBe('approved');
    expect(row.title).toBe(dmText.clean('Mới <b>'));
    expect(db.prepare('SELECT COUNT(*) n FROM puzzle_progress WHERE puzzle_id = ?').get(id).n).toBe(1);
  });
  it('a reviewer may rename; another member gets 403; guests 403; bad titles 400; missing 404', async () => {
    expect((await rename('boss', 'Của mod')).status).toBe(200);
    expect((await rename('other', 'x')).body.code).toBe('PUZZLE_FORBIDDEN');
    expect((await rename('guest', 'x')).status).toBe(403);
    expect((await rename('author', '')).body.code).toBe('PUZZLE_TITLE_INVALID');
    expect((await rename('author', 'a'.repeat(61))).body.code).toBe('PUZZLE_TITLE_INVALID');
    expect((await call('PATCH', '/api/puzzles/nope/title', 'author', { title: 'x' })).status).toBe(404);
    expect(db.prepare('SELECT title FROM puzzles WHERE id = ?').get(id).title).toBe('Của mod');
  });
});

describe('delete puzzle', () => {
  let id;
  const del = (as, pid) => call('DELETE', `/api/puzzles/${pid || id}`, as);
  beforeEach(async () => {
    id = (await submit('author', good({ title: 'Xoá tôi' }))).body.id;
    await call('POST', `/api/puzzles/${id}/review`, 'boss', { decision: 'approve' });
    await call('POST', `/api/puzzles/${id}/solve`, 'solver', { moves: ['K8'] });
  });

  it('the author deletes it: row, tags and solves are gone', async () => {
    expect((await del('author')).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) n FROM puzzles WHERE id = ?').get(id).n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM puzzle_tags WHERE puzzle_id = ?').get(id).n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM puzzle_progress WHERE puzzle_id = ?').get(id).n).toBe(0);
    expect((await call('GET', `/api/puzzles/${id}`, 'author')).status).toBe(404);
  });

  it('a reviewer may delete; another member gets 403; guests 403; missing 404', async () => {
    expect((await del('other')).body.code).toBe('PUZZLE_FORBIDDEN');
    expect((await del('guest')).status).toBe(403);
    expect((await del('author', 'nope')).status).toBe(404);
    expect((await del('boss')).status).toBe(200);
  });

  it('a deleted highest #number is never handed out again', async () => {
    const number = db.prepare('SELECT number FROM puzzles WHERE id = ?').get(id).number;
    await del('author');
    const next = (await submit('author', good({ title: 'Mới' }))).body.id;
    expect(db.prepare('SELECT number FROM puzzles WHERE id = ?').get(next).number).toBeGreaterThan(number);
  });
});

describe('#337 rename log', () => {
  let id;
  beforeAll(async () => {
    id = (await submit('author', good({ title: 'Gốc' }))).body.id;
    await call('POST', `/api/puzzles/${id}/review`, 'boss', { decision: 'approve' });
  });
  const rename = (as, title) => call('PATCH', `/api/puzzles/${id}/title`, as, { title });
  const log = (as) => call('GET', '/api/puzzles/renames', as);

  it('each real rename leaves one row (old → new, who); an unchanged title leaves none', async () => {
    const before = db.prepare('SELECT COUNT(*) n FROM puzzle_renames WHERE puzzle_id = ?').get(id).n;
    await rename('author', 'Gốc');
    expect(db.prepare('SELECT COUNT(*) n FROM puzzle_renames WHERE puzzle_id = ?').get(id).n).toBe(before);
    await rename('author', 'Tên hai');
    await rename('boss', 'Tên ba');
    const rows = db.prepare('SELECT old_title, new_title, user_id FROM puzzle_renames WHERE puzzle_id = ? ORDER BY id').all(id);
    expect(rows.slice(-2)).toEqual([
      { old_title: 'Gốc', new_title: 'Tên hai', user_id: U.author },
      { old_title: 'Tên hai', new_title: 'Tên ba', user_id: U.boss },
    ]);
  });
  it('only reviewers read the log; newest first with number, status and who', async () => {
    expect((await log('author')).body.code).toBe('PUZZLE_FORBIDDEN');
    expect((await log('guest')).status).toBe(403);
    expect((await call('GET', '/api/puzzles/renames')).status).toBe(401);
    const r = await log('boss');
    expect(r.status).toBe(200);
    expect(r.body.renames[0]).toMatchObject({ puzzleId: id, oldTitle: 'Tên hai', newTitle: 'Tên ba', status: 'approved', by: { username: 'boss' } });
    expect(r.body.renames[0].number).toBeGreaterThan(0);
    expect(r.body.pagination.total).toBeGreaterThanOrEqual(2);
  });
  it('keeps only the newest 50 rows per puzzle', async () => {
    for (let i = 0; i < 55; i++) await rename('author', `T${i}`);
    expect(db.prepare('SELECT COUNT(*) n FROM puzzle_renames WHERE puzzle_id = ?').get(id).n).toBe(50);
    expect(db.prepare('SELECT new_title FROM puzzle_renames WHERE puzzle_id = ? ORDER BY id DESC LIMIT 1').get(id).new_title).toBe('T54');
  });
  it('a rename never changes status or progress (#334 stays free)', async () => {
    expect(db.prepare('SELECT status FROM puzzles WHERE id = ?').get(id).status).toBe('approved');
  });
});

describe('#335 attempt limit + #336 attempt record', () => {
  let id;
  beforeAll(async () => {
    id = (await submit('author', good({ title: 'Giới hạn' }))).body.id;
    await call('POST', `/api/puzzles/${id}/review`, 'boss', { decision: 'approve' });
  });
  const solve = (as, moves) => call('POST', `/api/puzzles/${id}/solve`, as, { moves });

  it('3 wrong tries lock the member out (429, attemptsLeft 0); others are unaffected', async () => {
    const r1 = await solve('other', ['A1']);
    expect(r1.body).toMatchObject({ correct: false, attemptsUsed: 1, attemptsLeft: 2, maxAttempts: 3 });
    await solve('other', ['A2']);
    expect((await solve('other', ['A3'])).body.attemptsLeft).toBe(0);
    const blocked = await solve('other', ['K8']);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ code: 'PUZZLE_ATTEMPTS_EXCEEDED', attemptsLeft: 0 });
    expect(db.prepare('SELECT COUNT(*) n FROM puzzle_attempts WHERE user_id = ? AND puzzle_id = ?').get(U.other, id).n).toBe(3);
    expect((await solve('solver', ['K8'])).body.correct).toBe(true);
  });

  it('malformed moves do not use a try; a solved puzzle is exempt from the cap', async () => {
    const used = (await solve('author', ['A1'])).body.attemptsUsed;
    expect((await solve('author', [])).status).toBe(400);
    expect((await solve('author', ['A2'])).body.attemptsUsed).toBe(used + 1);
    expect((await solve('solver', ['A5'])).body.attemptsLeft).toBeNull();
    for (let i = 0; i < 4; i++) expect((await solve('solver', ['A6'])).status).toBe(200);
  });

  it('GET /attempts returns only my own tries, newest first, with the moves; login needed', async () => {
    const mine = (await call('GET', `/api/puzzles/${id}/attempts`, 'other')).body;
    expect(mine.attempts.map((a) => a.moves[0].y)).toEqual([12, 13, 14]); // A3, A2, A1 (rows count from the bottom)
    expect((await call('GET', `/api/puzzles/${id}/attempts`)).status).toBe(401);
  });

  it('GET /solvers is public: who solved and in how many tries (up to the first correct)', async () => {
    const r = await call('GET', `/api/puzzles/${id}/solvers`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(1);
    expect(r.body.solvers).toEqual([expect.objectContaining({ username: 'solver', tries: 1 })]);
    expect(JSON.stringify(r.body)).not.toMatch(/moves/);
    expect((await call('GET', '/api/puzzles/nope/solvers')).status).toBe(404);
  });
});

describe('walls + portals layout', () => {
  const layout = { walls: [{ x: 0, y: 0 }], portals: [{ a: { x: 1, y: 0 }, b: 'C1' }] };
  it('round-trips walls and portals (text cells normalised)', async () => {
    addUser('layouter');
    expect((await submit('layouter', good({ layout }))).status).toBe(201);
    const p = (await call('GET', '/api/puzzles/mine', 'layouter')).body.puzzles[0];
    expect(p.walls).toEqual([{ x: 0, y: 0 }]);
    expect(p.portals).toEqual([{ a: { x: 1, y: 0 }, b: { x: 2, y: 14 } }]);
  });

  it('puzzles without a layout come back with empty walls/portals', async () => {
    addUser('plain');
    await submit('plain', good());
    const p = (await call('GET', '/api/puzzles/mine', 'plain')).body.puzzles[0];
    expect([p.walls, p.portals]).toEqual([[], []]);
  });

  it.each([
    ['wall on a stone', { walls: [{ x: 7, y: 7 }] }],
    ['wall off the board', { walls: [{ x: 15, y: 0 }] }],
    ['duplicate wall', { walls: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }],
    ['portal missing an end', { portals: [{ a: { x: 1, y: 1 } }] }],
    ['wall on the answer cell', { walls: [{ x: 6, y: 7 }] }],
  ])('rejects %s', async (_n, bad) => {
    addUser(`lay${_n.length}`);
    const r = await submit(`lay${_n.length}`, good({ layout: bad }));
    expect(r.status).toBe(400);
  });
});

describe('GET /mine paging (#279)', () => {
  beforeAll(() => {
    addUser('prolific');
    const ins = db.prepare(`INSERT INTO puzzles (id, author_id, title, prompt, rule, board_size, stones, layout, to_move, mode, answers, level, position_hash, status, created_at, updated_at)
      VALUES (?, ?, ?, 'p', 'freestyle', 15, '[]', '{}', 'BLACK', 'sequence', '[]', 'easy', ?, 'approved', ?, ?)`);
    for (let i = 0; i < 45; i++) {
      const at = new Date(Date.parse(NOW) + i * 1000).toISOString();
      ins.run(`pm${i}`, U.prolific, `P${i}`, `h${i}`, at, at);
    }
  });

  it('returns 20 newest first with pagination; page 3 holds the rest; the total counts all', async () => {
    const p1 = (await call('GET', '/api/puzzles/mine', 'prolific')).body;
    expect(p1.puzzles).toHaveLength(20);
    expect(p1.puzzles[0].title).toBe('P44');
    expect(p1.pagination).toEqual({ page: 1, limit: 20, total: 45, totalPages: 3 });
    const p3 = (await call('GET', '/api/puzzles/mine?page=3', 'prolific')).body;
    expect(p3.puzzles.map((p) => p.title)).toEqual(['P4', 'P3', 'P2', 'P1', 'P0']);
    expect(p3.pagination.page).toBe(3);
  });

  it.each(['0', '-2', 'abc'])('page=%s falls back to page 1', async (q) => {
    const r = (await call('GET', `/api/puzzles/mine?page=${q}`, 'prolific')).body;
    expect(r.pagination.page).toBe(1);
    expect(r.puzzles[0].title).toBe('P44');
  });

  it('a page past the end is empty, and an author sees only their own', async () => {
    const r = (await call('GET', '/api/puzzles/mine?page=9', 'prolific')).body;
    expect(r.puzzles).toEqual([]);
    addUser('nopuz');
    expect((await call('GET', '/api/puzzles/mine', 'nopuz')).body.pagination.total).toBe(0);
  });
});

describe('#331 engine verdicts: review queue hint + alternative forced wins solve', () => {
  // Black to move. Row 8: W C8, black D8 E8 F8 (a closed three). Row 13: black F13 G13 H13 (an open three).
  const pos = [
    stone(2, 7, 'WHITE'), stone(3, 7, 'BLACK'), stone(4, 7, 'BLACK'), stone(5, 7, 'BLACK'),
    stone(5, 12, 'BLACK'), stone(6, 12, 'BLACK'), stone(7, 12, 'BLACK'),
    stone(0, 0, 'WHITE'), stone(2, 0, 'WHITE'), stone(4, 0, 'WHITE'), stone(6, 0, 'WHITE'), stone(8, 0, 'WHITE'),
  ];
  let id;
  beforeAll(async () => {
    addUser('vcf');
    id = (await submit('vcf', good({ title: 'VCF', tags: ['vcf'], stones: pos, answers: [[{ x: 8, y: 12 }], [{ x: 13, y: 13 }]] }))).body.id;
  });

  it('the queue carries one verdict per stored line; a quiet line is unchecked, not rejected', async () => {
    const p = (await call('GET', '/api/puzzles/review', 'boss')).body.puzzles.find((q) => q.id === id);
    expect(p.verification).toEqual([
      { status: 'verified', step: 1, reason: 'open_four' },
      { status: 'unchecked', step: 1, reason: 'not_forcing' },
    ]);
  });

  it('after approval, a forced win that is not stored solves; a non-win or a line past its win does not', async () => {
    expect((await call('POST', `/api/puzzles/${id}/review`, 'boss', { decision: 'approve' })).status).toBe(200);
    const solve = (moves) => call('POST', `/api/puzzles/${id}/solve`, 'solver', { moves }).then((r) => r.body.correct);
    expect(await solve([{ x: 4, y: 12 }])).toBe(true);                    // other end of the open three
    expect(await solve([{ x: 6, y: 7 }, { x: 8, y: 12 }])).toBe(true);    // four, forced block, open four
    expect(await solve([{ x: 9, y: 12 }])).toBe(false);                   // quiet move
    expect(await solve([{ x: 6, y: 7 }, { x: 7, y: 7 }])).toBe(false);    // lands on the forced block
    expect(await solve([{ x: 8, y: 12 }, { x: 9, y: 12 }])).toBe(false);  // moves past the win
  });
});
