/**
 * TODO.md #203 (7a-2) — puzzle list + solve pages.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/puzzle/p1"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const body = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const SOLVE_HTML = body('puzzle.html');
const LIST_HTML = body('puzzles.html');

const flush = () => new Promise((r) => setTimeout(r, 0));
const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });
const fail = (status, b) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(b) });

const handlers = [];
const realAdd = document.addEventListener.bind(document);
document.addEventListener = (type, fn, ...rest) => { if (type === 'DOMContentLoaded') handlers.push(fn); return realAdd(type, fn, ...rest); };

const PUZZLE = {
  id: 'p1', title: '<b>Bẫy</b>', prompt: 'Đen thắng', rule: 'freestyle', boardSize: 15, mode: 'sequence', level: 'easy',
  toMove: 'BLACK', tags: ['vcf'], author: { username: 'a', displayName: 'Alice' },
  stones: [{ x: 7, y: 7, color: 'BLACK' }, { x: 8, y: 7, color: 'WHITE' }],
};

let renderers;
function boot({ html, scripts, fetchImpl }) {
  handlers.splice(0).forEach((fn) => document.removeEventListener('DOMContentLoaded', fn));
  jest.resetModules();
  document.body.innerHTML = html;
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  window.PlatformShell = { build: jest.fn() };
  renderers = [];
  window.BoardRenderer = class {
    constructor(canvas, opts) { this.opts = opts; this.state = null; renderers.push(this); }
    setState(s) { this.state = { ...this.state, ...s }; }
    resize() {}
  };
  global.requestAnimationFrame = (fn) => fn();
  global.fetch = jest.fn(fetchImpl);
  window.Coords = require('../js/coords.js');
  window.PuzzleBoard = require('../js/puzzle-board.js'); // UMD: jest takes the CommonJS branch, a browser the global one
  scripts.forEach((s) => require(s));
  document.dispatchEvent(new Event('DOMContentLoaded'));
}
const settle = async () => { for (let i = 0; i < 5; i++) await flush(); };
const typeAnswer = (text) => { document.getElementById('pz-input').value = text; };
const submitForm = () => document.getElementById('pz-form').dispatchEvent(new Event('submit', { cancelable: true }));
const solveCalls = () => global.fetch.mock.calls.filter(([u]) => /\/solve$/.test(u)).length;

describe('solve page', () => {
  const solveBoot = (over = {}) => boot({
    html: SOLVE_HTML,
    scripts: ['../js/puzzle.js'],
    fetchImpl: (url, opts) => {
      if (over.fetch) { const r = over.fetch(url, opts); if (r) return r; }
      if (/\/solve$/.test(url)) return ok({ correct: false });
      if (url.includes('/rankings/me')) return ok({ userId: 'u1' });
      return ok({ puzzle: PUZZLE });
    },
  });

  it('renders the puzzle as text and draws the stones on the board', async () => {
    solveBoot(); await settle();
    expect(document.getElementById('pz-title').textContent).toBe('<b>Bẫy</b>');
    expect(document.getElementById('pz-title').querySelector('b')).toBeNull();
    expect(document.getElementById('pz-view').hidden).toBe(false);
    const { board, interactive } = renderers[0].state;
    expect(board[7][7]).toBe(1);
    expect(board[7][8]).toBe(2);
    expect(interactive).toBe(false); // view-only until solved or out of tries (#507)
  });

  it('while unsolved the board is view-only: clicks place nothing and the answer comes only from the text field (#507)', async () => {
    solveBoot(); await settle();
    renderers[0].opts.onCellClick(1, 6);
    expect(renderers[0].state.board[6][1]).toBe(0);
    expect(renderers[0].state.interactive).toBe(false);
    expect(document.getElementById('pz-input').value).toBe('');
    expect(document.getElementById('pz-reset').hidden).toBe(true);
    typeAnswer('B9'); submitForm(); await settle();
    expect(renderers[0].state.board[6][1]).toBe(1); // the typed move is shown in the solver's colour
    expect(renderers[0].state.interactive).toBe(false); // a wrong try with tries left keeps it locked
    renderers[0].opts.onCellClick(2, 6);
    expect(renderers[0].state.board[6][2]).toBe(0);
  });

  it('has no undo-last button (#507)', async () => {
    solveBoot(); await settle();
    expect(document.getElementById('pz-undo')).toBeNull();
    expect(document.querySelector('[data-i18n="puzzles.undo"]')).toBeNull();
    expect(fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8')).not.toMatch(/'puzzles\.undo'/);
    // The empty-moves hint must not tell the solver to click the (view-only) board.
    const hint = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8').split('\n').filter((l) => l.includes("'puzzles.no_moves'"));
    expect(hint).toHaveLength(2);
    for (const l of hint) expect(l).not.toMatch(/bàn cờ|board/i);
  });

  it('Clear empties the typed answer; it is enabled as soon as there is text (#507)', async () => {
    solveBoot(); await settle();
    const clear = document.getElementById('pz-clear');
    expect(clear.disabled).toBe(true);
    typeAnswer('B9'); document.getElementById('pz-input').dispatchEvent(new Event('input'));
    expect(clear.disabled).toBe(false);
    clear.click();
    expect(document.getElementById('pz-input').value).toBe('');
    expect(clear.disabled).toBe(true);
  });

  it('submits typed coordinates (letters or sequence numbers) as labels and shows "wrong"', async () => {
    solveBoot(); await settle();
    document.getElementById('pz-input').value = '122, h8x';
    document.getElementById('pz-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(document.getElementById('pz-result').textContent).toBe('err.puzzle_moves_invalid');
    expect(global.fetch.mock.calls.some(([u]) => /\/solve$/.test(u))).toBe(false);

    document.getElementById('pz-input').value = '122, 133';
    document.getElementById('pz-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    const call = global.fetch.mock.calls.find(([u]) => /\/solve$/.test(u));
    expect(JSON.parse(call[1].body)).toEqual({ moves: ['B9', 'M9'] }); // stride 20 on 15x15: 122 = row 7 col 2, 133 = row 7 col 13
    expect(document.getElementById('pz-result').textContent).toBe('puzzles.wrong');
  });

  it('a correct answer unlocks the board for free study: alternating stones, nothing submitted, reset to the puzzle (#507)', async () => {
    solveBoot({ fetch: (u) => (/\/solve$/.test(u) ? ok({ correct: true }) : null) }); await settle();
    typeAnswer('B9'); submitForm(); await settle();
    expect(document.getElementById('pz-result').textContent).toBe('puzzles.correct');
    expect(document.getElementById('pz-next').hidden).toBe(false);
    const r = renderers[0];
    expect(r.state.interactive).toBe(true);
    expect(document.getElementById('pz-explore-note').hidden).toBe(false);
    const reset = document.getElementById('pz-reset');
    expect(reset.hidden).toBe(false);
    expect(reset.classList.contains('pz-btn--primary')).toBe(false); // the single raised primary stays "Puzzle khác"
    expect(solveCalls()).toBe(1);
    // board: 2 black (h8 + B9) vs 1 white → white, then black
    r.opts.onCellClick(3, 3); r.opts.onCellClick(4, 4);
    r.opts.onCellClick(7, 7); // occupied → ignored
    expect([r.state.board[3][3], r.state.board[4][4], r.state.board[7][7]]).toEqual([2, 1, 1]);
    expect(r.state.lastMove).toEqual({ x: 4, y: 4 });
    expect(r.state.myColor).toBe('WHITE');
    await settle();
    expect(solveCalls()).toBe(1); // exploring never submits
    expect(document.getElementById('pz-submit').disabled).toBe(true);
    reset.click();
    expect(r.state.board[3][3]).toBe(0);
    expect(r.state.board[4][4]).toBe(0);
    expect(r.state.board[6][1]).toBe(0); // back to the puzzle position: the answer stones go too
    expect(r.state.board[7][7]).toBe(1);
    expect(r.state.lastMove).toBeNull();
    expect(r.state.interactive).toBe(true); // still free to explore
  });

  it('a puzzle already solved opens unlocked (#507)', async () => {
    solveBoot({ fetch: (u) => (u.endsWith('/p1') ? ok({ puzzle: { ...PUZZLE, solved: true } }) : null) }); await settle();
    expect(renderers[0].state.interactive).toBe(true);
    renderers[0].opts.onCellClick(1, 1);
    expect(renderers[0].state.board[1][1]).toBe(1); // 1 black, 1 white on the puzzle → black
    expect(document.getElementById('pz-reset').hidden).toBe(false);
  });

  it('final_move accepts a single typed cell only', async () => {
    solveBoot({ fetch: (u) => (u.endsWith('/p1') ? ok({ puzzle: { ...PUZZLE, mode: 'final_move' } }) : null) }); await settle();
    typeAnswer('B9, C9'); submitForm(); await settle();
    expect(document.getElementById('pz-result').textContent).toBe('err.puzzle_moves_invalid');
    expect(solveCalls()).toBe(0);
    typeAnswer('C9'); submitForm(); await settle();
    expect(JSON.parse(global.fetch.mock.calls.find(([u]) => /\/solve$/.test(u))[1].body)).toEqual({ moves: ['C9'] });
  });

  it('a guest sees the login hint instead of calling solve; the board stays locked', async () => {
    solveBoot({ fetch: (u) => (u.includes('/rankings/me') ? fail(401, {}) : null) }); await settle();
    typeAnswer('B9'); submitForm(); await settle();
    expect(document.getElementById('pz-login').hidden).toBe(false);
    expect(solveCalls()).toBe(0);
    expect(renderers[0].state.interactive).toBe(false);
  });

  it('shows the translated error for an unknown puzzle', async () => {
    solveBoot({ fetch: (u) => (u.endsWith('/p1') ? fail(404, { code: 'PUZZLE_NOT_FOUND' }) : null) }); await settle();
    expect(document.getElementById('pz-error').hidden).toBe(false);
    expect(document.getElementById('pz-error').textContent).toBe('err.puzzle_not_found');
  });
});

describe('solve page — attempts, solvers, number (#333/#335/#336)', () => {
  const NUMBERED = { ...PUZZLE, number: 12, attemptsLeft: 3, attemptsUsed: 0, maxAttempts: 3 };
  const base = (over) => (url, opts) => {
    if (over && over(url, opts)) return over(url, opts);
    if (/\/solve$/.test(url)) return ok({ correct: false, attemptsUsed: 1, attemptsLeft: 2, maxAttempts: 3 });
    if (/\/solvers$/.test(url)) return ok({ total: 1, solvers: [{ username: 'bob', displayName: 'Bob', tries: 2, avatarUrl: null }] });
    if (/\/attempts$/.test(url)) return ok({ attempts: [{ moves: [{ x: 1, y: 6 }], correct: false, createdAt: 't' }], attemptsLeft: 2 });
    if (url.includes('/rankings/me')) return ok({ userId: 'u1' });
    return ok({ puzzle: NUMBERED });
  };
  const submit = async () => { typeAnswer('B9'); submitForm(); await settle(); };

  it('title carries "#n"; tries left, solvers (who + tries) and my history render as text', async () => {
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: base() }); await settle();
    expect(document.getElementById('pz-title').textContent).toBe('<b>Bẫy</b> #12');
    expect(document.getElementById('pz-attempts').textContent).toContain('puzzles.attempts_left{"n":2}'); // history refresh reports 2 left
    expect(document.getElementById('pz-solvers-list').textContent).toContain('Bob');
    expect(document.getElementById('pz-solvers-list').textContent).toContain('puzzles.solver_tries{"n":2}');
    expect(document.getElementById('pz-history').hidden).toBe(false);
    expect(document.getElementById('pz-history-list').textContent).toContain('B9');
  });

  it('a wrong try updates the tries left; at 0 the Check button is disabled', async () => {
    let tried = false;
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: base((u) => (/\/solve$/.test(u) ? ((tried = true), ok({ correct: false, attemptsLeft: 0 })) : /\/attempts$/.test(u) ? ok({ attempts: [], attemptsLeft: tried ? 0 : 1 }) : null)) }); await settle();
    expect(renderers[0].state.interactive).toBe(false); // 1 try left: still locked
    await submit();
    expect(document.getElementById('pz-attempts').textContent).toContain('puzzles.attempts_none');
    expect(document.getElementById('pz-submit').disabled).toBe(true);
    expect(renderers[0].state.interactive).toBe(true); // out of tries → free study (#507)
    expect(document.getElementById('pz-reset').hidden).toBe(false);
    renderers[0].opts.onCellClick(3, 3);
    expect(renderers[0].state.board[3][3]).toBe(2); // 2 black (h8 + B9) vs 1 white → white
    expect(solveCalls()).toBe(1);
  });

  it('opening a puzzle with no tries left starts unlocked (#507)', async () => {
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: base((u) => (u.endsWith('/p1') ? ok({ puzzle: { ...NUMBERED, attemptsLeft: 0 } }) : /\/attempts$/.test(u) ? ok({ attempts: [], attemptsLeft: 0 }) : null)) }); await settle();
    expect(renderers[0].state.interactive).toBe(true);
    expect(document.getElementById('pz-submit').disabled).toBe(true);
  });

  it('a 429 from the server shows the out-of-tries message', async () => {
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: base((u) => (/\/solve$/.test(u) ? fail(429, { code: 'PUZZLE_ATTEMPTS_EXCEEDED' }) : null)) }); await settle();
    expect(renderers[0].state.interactive).toBe(false); // 2 tries left before the refused one
    global.fetch.mockImplementation(base((u) => (/\/solve$/.test(u) ? fail(429, { code: 'PUZZLE_ATTEMPTS_EXCEEDED' }) : /\/attempts$/.test(u) ? ok({ attempts: [], attemptsLeft: 0 }) : null)));
    await submit();
    expect(document.getElementById('pz-result').textContent).toBe('puzzles.attempts_none');
    expect(document.getElementById('pz-submit').disabled).toBe(true);
    expect(renderers[0].state.interactive).toBe(true);
  });

  it('a guest still sees who solved it but gets no history request', async () => {
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: base((u) => (u.includes('/rankings/me') ? fail(401, {}) : null)) }); await settle();
    expect(document.getElementById('pz-solvers').hidden).toBe(false);
    expect(global.fetch.mock.calls.some(([u]) => /\/attempts$/.test(u))).toBe(false);
  });
});

describe('solve page — #508 three steps, position, next puzzle', () => {
  const POSD = { ...PUZZLE, number: 12, attemptsLeft: 3, attemptsUsed: 1, maxAttempts: 3, position: { index: 3, total: 19, nextId: 'p7' } };
  const fetchFor = (over) => (url) => {
    if (over) { const r = over(url); if (r) return r; }
    if (/\/solve$/.test(url)) return ok({ correct: true, attemptsUsed: 2, attemptsLeft: null });
    if (/\/solvers$/.test(url)) return ok({ total: 15, solvers: [] });
    if (/\/attempts$/.test(url)) return ok({ attempts: [{ moves: [{ x: 1, y: 6 }, { x: 2, y: 6 }], correct: false, createdAt: 't' }], attemptsLeft: 2, attemptsUsed: 1 });
    if (url.includes('/rankings/me')) return ok({ userId: 'u1' });
    return ok({ puzzle: POSD });
  };
  const cls = (id) => document.getElementById(id).className;

  it('live: answer step on, explore step locked, form and lock note shown; eyebrow "puzzle N of M"', async () => {
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: fetchFor() }); await settle();
    expect(cls('pz-step-read')).toContain('is-done');
    expect(cls('pz-step-answer')).toContain('is-on');
    expect(cls('pz-step-explore')).not.toContain('is-on');
    expect(document.getElementById('pz-form').hidden).toBe(false);
    expect(document.getElementById('pz-lock').hidden).toBe(false);
    expect(document.getElementById('pz-explore-locked').hidden).toBe(false);
    expect(document.getElementById('pz-position').textContent).toBe('puzzles.position{"n":3,"m":19,"level":"puzzles.level_easy"}');
    expect(document.getElementById('pz-tries-n').textContent).toBe('1');
    expect(document.getElementById('pz-solvers-n').textContent).toBe('15');
  });

  it('solved: answer step done, explore step on, form gone, board unlocked; next link goes to the next unsolved puzzle', async () => {
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: fetchFor() }); await settle();
    typeAnswer('B9'); submitForm(); await settle();
    expect(cls('pz-step-answer')).toContain('is-done');
    expect(cls('pz-step-explore')).toContain('is-on');
    expect(document.getElementById('pz-form').hidden).toBe(true);
    expect(document.getElementById('pz-lock').hidden).toBe(true);
    expect(document.getElementById('pz-view').classList.contains('is-open')).toBe(true);
    expect(renderers[0].state.interactive).toBe(true);
    const next = document.getElementById('pz-next-link');
    expect([next.getAttribute('href'), next.textContent]).toEqual(['/puzzle/p7', 'puzzles.next']);
  });

  it('no position (old payload) → no eyebrow and the next link stays on the list', async () => {
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: fetchFor((u) => (u.endsWith('/p1') ? ok({ puzzle: PUZZLE }) : null)) }); await settle();
    expect(document.getElementById('pz-position').hidden).toBe(true);
    expect(document.getElementById('pz-next-link').getAttribute('href')).toBe('/puzzles');
  });

  it('facts are separate chips and history shows each try as a chip with its verdict word (no " · ")', async () => {
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: fetchFor() }); await settle();
    expect([...document.querySelectorAll('#pz-meta .pz-tag')].map((n) => n.textContent))
      .toEqual(['puzzles.level_easy', 'puzzles.rule_freestyle', '15×15', 'puzzles.tag_vcf']);
    const chip = document.querySelector('#pz-history-list .pz-tag');
    expect(chip.textContent).toBe('B9, C9 puzzles.attempt_wrong');
    expect(document.getElementById('pz-view').textContent).not.toContain(' · ');
  });
});

describe('list page', () => {
  const PAGE = {
    puzzles: [{ id: 'p1', title: '<i>T</i>', rule: 'caro', boardSize: 19, level: 'hard', tags: ['trap'], solved: true, author: { displayName: 'Bob' } }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
  };
  const listBoot = () => boot({ html: LIST_HTML, scripts: ['../js/puzzles.js'], fetchImpl: () => ok(PAGE) });

  it('renders cards as text linking to /puzzle/<id>', async () => {
    listBoot(); await settle();
    const card = document.querySelector('.pz-card');
    expect(card.getAttribute('href')).toBe('/puzzle/p1');
    expect(card.querySelector('b').textContent).toBe('<i>T</i>');
    expect(card.querySelector('i')).toBeNull();
    expect(card.classList.contains('is-solved')).toBe(true);
  });

  it('a filter chip re-queries with the filter', async () => {
    listBoot(); await settle();
    const chip = [...document.querySelectorAll('#pz-levels .pz-seg__opt')].find((b) => b.textContent === 'puzzles.level_hard');
    chip.click(); await settle();
    expect(global.fetch.mock.calls.pop()[0]).toBe('/api/puzzles?level=hard');
    chip.click(); await settle(); // cleared → back to one shelf per level
    expect(global.fetch.mock.calls.slice(-5).map(([u]) => u)).toEqual([
      '/api/puzzles/progress?', '/api/puzzles?level=easy', '/api/puzzles?level=medium', '/api/puzzles?level=hard', '/api/puzzles?level=expert',
    ]);
  });
});

describe('list page — #508 training path (shelves, progress, continue)', () => {
  const P = (id, level, solved, extra) => ({ id, number: id.length, title: 'T-' + id, prompt: 'Đề ' + id, rule: 'caro', boardSize: 15, level, toMove: 'WHITE', tags: ['vcf'], solved, ...extra });
  const LISTS = { easy: [P('e1', 'easy', true), P('e2', 'easy', false)], medium: [], hard: [P('h1', 'hard', false)], expert: [] };
  const PROG = { total: 3, solved: 1, levels: {
    easy: { total: 2, solved: 1, nextId: 'e2' }, medium: { total: 0, solved: 0, nextId: null },
    hard: { total: 1, solved: 0, nextId: 'h1' }, expert: { total: 0, solved: 0, nextId: null } } };
  const fetchFor = (prog) => (u) => {
    if (u.startsWith('/api/puzzles/progress')) return prog ? ok(prog) : fail(500, {});
    const lv = (u.match(/level=(\w+)/) || [])[1];
    const list = lv ? LISTS[lv] : [];
    return ok({ puzzles: list, pagination: { page: 1, limit: 20, total: list.length, totalPages: list.length ? 1 : 0 } });
  };
  const shelfBoot = (prog) => boot({ html: LIST_HTML, scripts: ['../js/puzzles.js'], fetchImpl: fetchFor(prog) });

  it('one shelf per non-empty level, in level order, with "n / m solved" and a progress bar', async () => {
    shelfBoot(PROG); await settle();
    const shelves = [...document.querySelectorAll('#pz-shelves .pz-shelf')];
    expect(shelves.map((s) => s.querySelector('h2').textContent)).toEqual(['puzzles.level_easy', 'puzzles.level_hard']);
    expect(shelves[0].textContent).toContain('puzzles.shelf_progress{"n":1,"m":2}');
    const bar = shelves[0].querySelector('[role=progressbar]');
    expect([bar.getAttribute('aria-valuenow'), bar.getAttribute('aria-valuemax')]).toEqual(['1', '2']);
    expect(shelves[0].querySelectorAll('.pz-strip .pz-card')).toHaveLength(2);
    expect(document.getElementById('pz-list').children).toHaveLength(0);
    expect(document.getElementById('pz-pager').children).toHaveLength(0);
    expect(document.getElementById('pz-total').textContent).toBe('puzzles.path_solved{"n":1,"m":3}');
  });

  it('the hero continue link is the single primary and points at the first unsolved puzzle, easiest level first', async () => {
    shelfBoot(PROG); await settle();
    const c = document.getElementById('pz-continue');
    expect(c.hidden).toBe(false);
    expect(c.getAttribute('href')).toBe('/puzzle/e2');
    expect(c.textContent).toBe('puzzles.continue{"title":"T-e2"}');
    expect([...document.querySelectorAll('.pz-btn--primary')].filter((n) => !n.hidden)).toHaveLength(1);
  });

  it('cards give each fact its own chip (no " · " join) and keep title text as text', async () => {
    shelfBoot(PROG); await settle();
    const card = document.querySelector('.pz-card[href="/puzzle/e1"]');
    expect(card.querySelector('b').textContent).toBe('T-e1');
    expect(card.querySelector('.pz-num').textContent).toBe('#2');
    expect([...card.querySelectorAll('.pz-card__meta .pz-tag')].map((n) => n.textContent))
      .toEqual(['puzzles.level_easy', 'puzzles.rule_caro', '15×15', 'puzzles.side_white_short', 'puzzles.tag_vcf']);
    expect(document.getElementById('pz-shelves').textContent).not.toContain(' · ');
  });

  it('"See all" opens that level as a paged grid with its progress head', async () => {
    shelfBoot(PROG); await settle();
    document.querySelector('#pz-shelves .pz-shelf button').click(); await settle();
    expect(global.fetch.mock.calls.slice(-2).map(([u]) => u)).toEqual(['/api/puzzles/progress?', '/api/puzzles?level=easy']);
    expect(window.location.search).toBe('?level=easy');
    expect(document.getElementById('pz-shelves').children).toHaveLength(0);
    expect(document.querySelectorAll('#pz-list .pz-card')).toHaveLength(2);
    expect(document.getElementById('pz-level-head').hidden).toBe(false);
    expect(document.getElementById('pz-level-head').textContent).toContain('puzzles.shelf_progress{"n":1,"m":2}');
    window.history.replaceState(null, '', '/puzzles');
  });

  it('guests: counts without bars; a failed progress call still shows the shelves and no continue link', async () => {
    shelfBoot({ total: 3, solved: null, levels: { easy: { total: 2, solved: null, nextId: 'e1' } } }); await settle();
    expect(document.querySelector('#pz-shelves .pz-shelf').textContent).toContain('puzzles.total{"n":2}');
    expect(document.querySelector('[role=progressbar]')).toBeNull();
    expect(document.getElementById('pz-total').textContent).toBe('puzzles.total{"n":3}');
    shelfBoot(null); await settle();
    expect(document.querySelectorAll('#pz-shelves .pz-shelf')).toHaveLength(2);
    expect(document.getElementById('pz-continue').hidden).toBe(true);
  });

  it('nothing in any level → the empty state', async () => {
    boot({ html: LIST_HTML, scripts: ['../js/puzzles.js'], fetchImpl: () => ok({ puzzles: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }) }); await settle();
    expect(document.getElementById('pz-empty').hidden).toBe(false);
    expect(document.getElementById('pz-empty').textContent).toBe('puzzles.empty');
  });
});

describe('list page — #277 pager scrolls to the list', () => {
  const pg = (n) => ({ puzzles: [], pagination: { page: n, limit: 20, total: 45, totalPages: 3 } });
  afterEach(() => { delete Element.prototype.scrollIntoView; });

  it('Sau / Trước scroll #pz-list to the top of the viewport; first load and filter changes do not', async () => {
    const spy = jest.fn(); Element.prototype.scrollIntoView = spy;
    boot({ html: LIST_HTML, scripts: ['../js/puzzles.js'], fetchImpl: (u) => ok(pg(u.includes('page=2') ? 2 : 1)) }); await settle();
    expect(spy).not.toHaveBeenCalled();
    [...document.querySelectorAll('#pz-levels .pz-seg__opt')][0].click(); await settle();
    expect(spy).not.toHaveBeenCalled();
    [...document.querySelectorAll('#pz-pager button')][1].click(); await settle(); // Sau
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.contexts[0]).toBe(document.getElementById('pz-list'));
    expect(spy.mock.calls[0][0]).toEqual({ block: 'start' });
    [...document.querySelectorAll('#pz-pager button')][0].click(); await settle(); // Trước
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('list page — #274 URL under <base href="/"> / #275 member actions / #276 labelled filters', () => {
  const PAGE = { puzzles: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
  const listBoot = () => boot({ html: LIST_HTML, scripts: ['../js/puzzles.js'], fetchImpl: () => ok(PAGE) });
  afterEach(() => { document.head.querySelectorAll('base').forEach((b) => b.remove()); delete window.GvnSession; window.history.replaceState(null, '', '/puzzle/p1'); });

  it('filtering keeps the page path (a bare "?x" would resolve to "/?x" against <base href="/">)', async () => {
    const base = document.createElement('base'); base.href = '/'; document.head.appendChild(base);
    window.history.replaceState(null, '', '/puzzles');
    listBoot(); await settle();
    expect(window.location.pathname).toBe('/puzzles');
    expect(window.location.search).toBe('');
    [...document.querySelectorAll('#pz-levels .pz-seg__opt')].find((b) => b.textContent === 'puzzles.level_easy').click(); await settle();
    expect(window.location.pathname).toBe('/puzzles');
    expect(window.location.search).toBe('?level=easy');
  });

  it('anonymous visitors and guests do not get the member action buttons; members do', async () => {
    window.GvnSession = { getUser: () => null };
    listBoot(); await settle();
    expect(document.getElementById('pz-actions').hidden).toBe(true);
    window.GvnSession = { getUser: () => ({ userId: 'guest_1', isGuest: true }) };
    listBoot(); await settle();
    expect(document.getElementById('pz-actions').hidden).toBe(true);
    window.GvnSession = { getUser: () => ({ userId: 'u1', isGuest: false }) };
    listBoot(); await settle();
    expect(document.getElementById('pz-actions').hidden).toBe(false);
  });

  it('level / rule / topic groups carry a visible label', () => {
    document.body.innerHTML = LIST_HTML;
    const labels = [...document.querySelectorAll('.pz-filter > .pz-filter__label')].map((n) => n.getAttribute('data-i18n'));
    expect(labels).toEqual(['puzzles.filter_level', 'puzzles.filter_rule', 'puzzles.filter_tag']);
    expect(document.querySelectorAll('.pz-filter #pz-tags').length).toBe(1);
  });
});

describe('solve page — guest (#273/#275)', () => {
  it('a guest (200 from /rankings/me with a guest_ id) sees the login prompt on load and never calls solve', async () => {
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: (u) => (u.includes('/rankings/me') ? ok({ userId: 'guest_ab12' }) : ok({ puzzle: PUZZLE })) });
    await settle();
    expect(document.getElementById('pz-login').hidden).toBe(false);
    renderers[0].opts.onCellClick(1, 6);
    document.getElementById('pz-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(global.fetch.mock.calls.some(([u]) => /\/solve$/.test(u))).toBe(false);
  });
  it('a member does not see the prompt', async () => {
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: (u) => (u.includes('/rankings/me') ? ok({ userId: 'u1' }) : ok({ puzzle: PUZZLE })) });
    await settle();
    expect(document.getElementById('pz-login').hidden).toBe(true);
  });
});

describe('solve page — submit availability', () => {
  it('the Check button is enabled before any move, so typed coordinates can be submitted', async () => {
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: (u) => (u.includes('/rankings/me') ? ok({}) : ok({ puzzle: PUZZLE })) });
    await settle();
    expect(document.getElementById('pz-submit').disabled).toBe(false);
  });
});

describe('Modern control hierarchy & tokens (#504)', () => {
  const raw = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  it('list and solve pages use body.pz-page, zero classic .pbtn/.pchip/.ptab, and mirror replay.css tokens', async () => {
    for (const f of ['puzzles.html', 'puzzle.html']) {
      expect(raw(f)).toMatch(/<body class="pl pz-page">/);
    }
    const css = raw('css/puzzles.css');
    const replayCss = raw('css/replay.css');
    for (const val of ['10px', '14px', 'cubic-bezier(.2, .8, .2, 1)', '0 0 0 2px var(--c-surface), 0 0 0 4px var(--c-brand-text)', '0 1px 2px rgba(0, 0, 0, .18), 0 4px 12px -2px rgba(0, 0, 0, .22)']) {
      expect(replayCss).toContain(val);
      expect(css).toContain(val);
    }
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/@media \(max-width: 860px\)[\s\S]*min-height:\s*44px/);

    // List page with pagination: 1 raised primary, segmented tabs + filters, quiet pager, 0 .pbtn
    window.GvnSession = { getUser: () => ({ userId: 'u1', isGuest: false }) };
    boot({
      html: LIST_HTML,
      scripts: ['../js/puzzles.js'],
      fetchImpl: (u) => ok(u.startsWith('/api/puzzles/progress')
        ? { total: 45, solved: 0, levels: { easy: { total: 45, solved: 0, nextId: 'p9' } } }
        : { puzzles: [], pagination: { page: 1, limit: 20, total: 45, totalPages: 3 } }),
    });
    await settle();
    delete window.GvnSession;
    [...document.querySelectorAll('#pz-levels .pz-seg__opt')][0].click(); await settle(); // the pager belongs to one level's grid (#508)
    expect(document.querySelectorAll('.pbtn, .pchip, .ptab')).toHaveLength(0);
    expect(document.querySelectorAll('.pz-btn--primary:not([hidden])')).toHaveLength(1);
    expect(document.querySelectorAll('.pz-tabs .pz-seg__opt')).toHaveLength(2);
    expect(document.querySelectorAll('#pz-pager .pz-tbtn--quiet')).toHaveLength(2);

    // Solve page unsolved -> solved: exactly 1 active raised primary in each state, danger clear pill
    boot({
      html: SOLVE_HTML,
      scripts: ['../js/puzzle.js'],
      fetchImpl: (u) => (/\/solve$/.test(u) ? ok({ correct: true }) : u.includes('/rankings/me') ? ok({ userId: 'u1' }) : ok({ puzzle: PUZZLE })),
    });
    await settle();
    expect(document.querySelectorAll('.pbtn, .pchip, .ptab')).toHaveLength(0);
    const activePrimaries = () => [...document.querySelectorAll('.pz-btn--primary')].filter((n) => !n.disabled && !n.closest('[hidden]'));
    expect(activePrimaries().map((n) => n.id)).toEqual(['pz-submit']);
    expect(document.getElementById('pz-clear').classList.contains('pz-tbtn--danger')).toBe(true);

    typeAnswer('B9'); submitForm(); await settle();
    expect(activePrimaries().map((n) => n.id)).toEqual(['pz-next-link']);
  });
});
