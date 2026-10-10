/**
 * TODO.md #203 (7a-3) — puzzle editor, my puzzles, review queue.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/puzzles/new"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const body = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const HTML = { editor: body('puzzle-editor.html'), mine: body('puzzles-mine.html'), review: body('admin.html') };

const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });
const fail = (status, b) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(b || {}) });

const handlers = [];
const realAdd = document.addEventListener.bind(document);
document.addEventListener = (type, fn, ...rest) => { if (type === 'DOMContentLoaded') handlers.push(fn); return realAdd(type, fn, ...rest); };

let renderers;
function boot(page, script, fetchImpl) {
  handlers.splice(0).forEach((fn) => document.removeEventListener('DOMContentLoaded', fn));
  jest.resetModules();
  document.body.innerHTML = HTML[page];
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  window.PlatformShell = { build: jest.fn() };
  renderers = [];
  window.BoardRenderer = class {
    constructor(canvas, opts) { this.opts = opts; this.state = null; renderers.push(this); }
    setState(s) { this.state = { ...this.state, ...s }; }
    resize() {}
  };
  global.requestAnimationFrame = (fn) => fn();
  window.Coords = require('../js/coords.js');
  window.PuzzleBoard = require('../js/puzzle-board.js');
  global.fetch = jest.fn(fetchImpl);
  require(script);
  if (window.PuzzlesReview) window.PuzzlesReview.init(); // a tab of /admin: admin.js starts it
  document.dispatchEvent(new Event('DOMContentLoaded'));
}
const $ = (id) => document.getElementById(id);
const clickTool = (n) => document.querySelectorAll('#ed-tools .pchip')[n].click();

describe('editor', () => {
  const editorBoot = (over) => boot('editor', '../js/puzzle-editor.js', (u, o) => (over && over(u, o)) || (u.includes('/rankings/me') ? ok({}) : ok({ id: 'new', status: 'pending' })));

  it('guests get a login hint and no board', async () => {
    editorBoot((u) => (u.includes('/rankings/me') ? fail(401) : null)); await settle();
    expect($('ed-view').hidden).toBe(true);
    expect($('ed-error').textContent).toBe('puzzles.login_to_submit');
  });

  it('tools place black / white / erase stones; the board state mirrors them', async () => {
    editorBoot(); await settle();
    const r = renderers[0];
    clickTool(0); r.opts.onCellClick(7, 7);
    clickTool(1); r.opts.onCellClick(8, 8);
    expect(r.state.board[7][7]).toBe(1);
    expect(r.state.board[8][8]).toBe(2);
    clickTool(2); r.opts.onCellClick(7, 7);
    expect(r.state.board[7][7]).toBe(0);
  });

  it('the answer tool appends labels to the active answer line (final_move keeps one)', async () => {
    editorBoot(); await settle();
    const r = renderers[0];
    clickTool(0); r.opts.onCellClick(7, 7); // a stone: answers cannot land on it
    clickTool(3);
    r.opts.onCellClick(1, 6); r.opts.onCellClick(2, 6); r.opts.onCellClick(7, 7);
    expect(document.querySelector('.pz-answer').value).toBe('B9, C9');
    $('ed-mode').value = 'final_move'; $('ed-mode').dispatchEvent(new Event('change'));
    r.opts.onCellClick(3, 6);
    expect(document.querySelector('.pz-answer').value).toBe('D9');
  });

  it('tags are capped at three', async () => {
    editorBoot(); await settle();
    [...document.querySelectorAll('#ed-tags .pchip')].slice(0, 4).forEach((b) => b.click());
    expect(document.querySelectorAll('#ed-tags .pchip[aria-pressed="true"]')).toHaveLength(3);
  });

  it('shrinking the board drops stones that no longer fit', async () => {
    editorBoot(); await settle();
    clickTool(0); renderers[0].opts.onCellClick(16, 16); // only possible once size > 15
    // a 15-board cannot be clicked at 16,16, but a stone placed on a 17-board must vanish when going back
    $('ed-size').value = '17'; $('ed-size').dispatchEvent(new Event('change'));
    renderers[0].opts.onCellClick(16, 16);
    expect(renderers[0].state.board[16][16]).toBe(1);
    $('ed-size').value = '15'; $('ed-size').dispatchEvent(new Event('change'));
    expect(renderers[0].state.board).toHaveLength(15);
  });

  it('submits the body (coords parsed against the board size) and maps server errors', async () => {
    editorBoot((u, o) => (o && o.method === 'POST' ? fail(400, { code: 'PUZZLE_STONES_INVALID' }) : null)); await settle();
    clickTool(0); renderers[0].opts.onCellClick(7, 7);
    clickTool(1); renderers[0].opts.onCellClick(6, 6);
    $('ed-title').value = 'T';
    document.querySelector('.pz-answer').value = '122';
    document.querySelector('.pz-answer').dispatchEvent(new Event('input'));
    $('ed-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    const body = JSON.parse(global.fetch.mock.calls.find(([, o]) => o && o.method === 'POST')[1].body);
    expect(body).toMatchObject({ title: 'T', boardSize: 15, toMove: 'BLACK', mode: 'sequence', answers: [[{ x: 1, y: 6 }]] });
    expect(body.stones).toEqual(expect.arrayContaining([{ x: 7, y: 7, color: 'BLACK' }, { x: 6, y: 6, color: 'WHITE' }]));
    expect($('ed-result').textContent).toBe('err.puzzle_stones_invalid');
    expect($('ed-submit').disabled).toBe(false);
  });

  it('an unparsable answer line is rejected client-side without calling the API', async () => {
    editorBoot(); await settle();
    document.querySelector('.pz-answer').value = 'Z99';
    document.querySelector('.pz-answer').dispatchEvent(new Event('input'));
    $('ed-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect($('ed-result').textContent).toBe('err.puzzle_moves_invalid');
    expect(global.fetch.mock.calls.some(([, o]) => o && o.method === 'POST')).toBe(false);
  });
});

describe('editor — edit mode', () => {
  it('?id= loads the puzzle (with answers) and saves with PUT', async () => {
    window.history.pushState({}, '', '/puzzles/new?id=p9');
    const P = { id: 'p9', title: 'Cũ', prompt: '', rule: 'caro', boardSize: 17, toMove: 'WHITE', mode: 'final_move', level: 'hard', status: 'approved', tags: ['trap'],
      stones: [{ x: 1, y: 1, color: 'BLACK' }, { x: 2, y: 2, color: 'BLACK' }, { x: 3, y: 3, color: 'WHITE' }], answers: [[{ x: 6, y: 8 }]] };
    boot('editor', '../js/puzzle-editor.js', (u) => (u.includes('/rankings/me') ? ok({}) : u.includes('/api/puzzles/p9') ? ok({ puzzle: P }) : ok({ id: 'p9', status: 'pending' })));
    await settle();
    expect($('ed-title').value).toBe('Cũ');
    expect($('ed-size').value).toBe('17');
    expect(document.querySelector('.pz-answer').value).toBe('G9'); // x=6 → G, y=8 on a 17 board → row 17-8 = 9
    expect($('ed-edit-note').hidden).toBe(false);
    $('ed-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    const put = global.fetch.mock.calls.find(([, o]) => o && o.method === 'PUT');
    expect(put[0]).toBe('/api/puzzles/p9');
    window.history.pushState({}, '', '/puzzles/new');
  });
});

describe('my puzzles', () => {
  const MINE = [
    { id: 'a', title: '<b>A</b>', status: 'rejected', level: 'easy', rule: 'caro', boardSize: 15, reviewNote: '<i>trùng</i>' },
    { id: 'b', title: 'B', status: 'approved', level: 'hard', rule: 'freestyle', boardSize: 17, reviewNote: '' },
  ];
  it('lists puzzles as text with the reject note, edit links, and an admin review link', async () => {
    boot('mine', '../js/puzzles-mine.js', (u) => (u.includes('/review') ? ok({ pagination: { total: 3 } }) : ok({ puzzles: MINE, canReview: true })));
    await settle();
    const rows = document.querySelectorAll('#mn-list .prow');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('b').textContent).toBe('<b>A</b>');
    expect(rows[0].querySelector('i')).toBeNull();
    expect(rows[0].textContent).toContain('puzzles.reject_note');
    expect(rows[0].querySelector('a').getAttribute('href')).toBe('/puzzles/new?id=a');
    expect(rows[1].querySelectorAll('a')).toHaveLength(2); // edit + view (approved only)
    expect($('mn-review').hidden).toBe(false);
  });

  it('a non-admin gets no review link and no review request', async () => {
    const errs = [];
    process.once('unhandledRejection', (e) => errs.push(String(e)));
    boot('mine', '../js/puzzles-mine.js', (u) => ok({ puzzles: MINE, canReview: false }));
    await settle();
    expect($('mn-review').hidden).toBe(true);
    expect(errs).toEqual([]); // init() is async: a ReferenceError there would only surface as an unhandled rejection
    expect(global.fetch.mock.calls.some(([u]) => u.includes('/review'))).toBe(false); // no probe → no 403 in the console
  });
});

describe('review queue', () => {
  const Q = [
    { id: 'q1', title: 'Một', prompt: 'x', rule: 'freestyle', boardSize: 15, toMove: 'BLACK', mode: 'sequence', level: 'easy', tags: ['vcf'], duplicates: 2,
      author: { displayName: 'Al' }, stones: [{ x: 7, y: 7, color: 'BLACK' }, { x: 6, y: 6, color: 'WHITE' }], answers: [[{ x: 1, y: 6 }, { x: 2, y: 6 }]] },
    { id: 'q2', title: 'Hai', prompt: '', rule: 'caro', boardSize: 15, toMove: 'BLACK', mode: 'final_move', level: 'medium', tags: ['trap'], duplicates: 0,
      author: { displayName: 'Bo' }, stones: [{ x: 7, y: 7, color: 'BLACK' }, { x: 6, y: 6, color: 'WHITE' }], answers: [[{ x: 3, y: 3 }]] },
  ];
  const reviewBoot = (over) => boot('review', '../js/puzzles-review.js', (u, o) => (over && over(u, o)) || ok({ puzzles: Q.slice(), pagination: { total: 2 } }));

  it('a non-admin sees the server message and no queue', async () => {
    reviewBoot((u) => fail(403, { code: 'PUZZLE_FORBIDDEN' })); await settle();
    expect($('rv-view').hidden).toBe(true);
    expect($('rv-msg').textContent).toBe('err.puzzle_forbidden');
  });

  it('shows the first puzzle, flags duplicates, and previews an answer line on the board', async () => {
    reviewBoot(); await settle();
    expect($('rv-title').textContent).toBe('Một');
    expect($('rv-dup').hidden).toBe(false);
    document.querySelector('#rv-answers .pchip').click();
    expect(renderers[0].state.board[6][1]).toBe(1);
    expect(renderers[0].state.board[6][2]).toBe(1);
    expect(renderers[0].state.interactive).toBe(false);
  });

  it('reject needs a note (no request); approve posts level + decision and moves to the next', async () => {
    reviewBoot((u, o) => (o && o.method === 'POST' ? ok({ id: 'q1', status: 'approved' }) : null)); await settle();
    $('rv-reject').click(); await settle();
    expect($('rv-result').textContent).toBe('puzzles.rv_note_required');
    expect(global.fetch.mock.calls.some(([, o]) => o && o.method === 'POST')).toBe(false);

    $('rv-level').value = 'hard';
    $('rv-approve').click(); await settle();
    const [url, opts] = global.fetch.mock.calls.find(([, o]) => o && o.method === 'POST');
    expect(url).toBe('/api/puzzles/q1/review');
    expect(JSON.parse(opts.body)).toMatchObject({ decision: 'approve', level: 'hard' });
    expect($('rv-title').textContent).toBe('Hai');
    expect(document.querySelectorAll('#rv-list .prow')).toHaveLength(1);
  });
});

describe('editor — answer lines', () => {
  it('focusing another answer line keeps the DOM (typing is not lost) and switches the active line', async () => {
    boot('editor', '../js/puzzle-editor.js', (u) => (u.includes('/rankings/me') ? ok({}) : ok({})));
    await settle();
    $('ed-add-answer').click();
    const [first, second] = document.querySelectorAll('.pz-answer');
    first.dispatchEvent(new Event('focus'));
    expect(document.querySelectorAll('.pz-answer')[0]).toBe(first); // same node: not re-rendered
    expect(first.classList.contains('is-active')).toBe(true);
    expect(second.classList.contains('is-active')).toBe(false);
  });
});
