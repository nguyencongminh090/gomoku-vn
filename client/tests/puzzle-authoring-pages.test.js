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
  window.PlatformShell = { build: jest.fn(), icon: () => document.createElement('svg') };
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
const clickTool = (id) => document.querySelector('#ed-tools .pz-seg__opt[data-tool="' + id + '"]').click();

describe('editor', () => {
  it('a guest (200 with a guest_ id) gets the login hint, not the editor (#275)', async () => {
    boot('editor', '../js/puzzle-editor.js', (u) => (u.includes('/rankings/me') ? ok({ userId: 'guest_ab12' }) : ok({})));
    await settle();
    expect($('ed-error').hidden).toBe(false);
    expect($('ed-error').textContent).toBe('puzzles.login_to_submit');
    expect($('ed-view').hidden).toBe(true);
  });

  it('the editor without a member session shows the prompt and makes no API call (#275)', async () => {
    window.GvnSession = { getUser: () => null };
    boot('editor', '../js/puzzle-editor.js', () => ok({ userId: 'u1' }));
    await settle();
    delete window.GvnSession;
    expect($('ed-error').textContent).toBe('puzzles.login_to_submit');
    expect(global.fetch.mock.calls.length).toBe(0);
  });

  it('/puzzles/mine without a member session shows the prompt and makes no API call (#275)', async () => {
    window.GvnSession = { getUser: () => null };
    boot('mine', '../js/puzzles-mine.js', () => ok({ puzzles: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } }));
    await settle();
    delete window.GvnSession;
    expect($('mn-msg').textContent).toBe('puzzles.login_to_submit');
    expect(global.fetch.mock.calls.some(([u]) => u.includes('/api/puzzles/mine'))).toBe(false);
  });

  const editorBoot = (over) => boot('editor', '../js/puzzle-editor.js', (u, o) => (over && over(u, o)) || (u.includes('/rankings/me') ? ok({ userId: 'u1' }) : ok({ id: 'new', status: 'pending' })));

  it('guests get a login hint and no board', async () => {
    editorBoot((u) => (u.includes('/rankings/me') ? fail(401) : null)); await settle();
    expect($('ed-view').hidden).toBe(true);
    expect($('ed-error').textContent).toBe('puzzles.login_to_submit');
  });

  it('the only stone tool is Auto (default); erase removes a stone (#506)', async () => {
    editorBoot(); await settle();
    const r = renderers[0];
    const tools = [...document.querySelectorAll('#ed-tools .pz-seg__opt')].map((b) => b.dataset.tool);
    expect(tools).toEqual(['AUTO', 'WALL', 'PORTAL', 'ERASE', 'ANSWER']);
    expect(document.querySelector('#ed-tools [aria-pressed="true"]').dataset.tool).toBe('AUTO');
    expect(document.querySelector('#ed-tools .pz-stone--black, #ed-tools .pz-stone--white')).toBeNull();
    r.opts.onCellClick(7, 7); r.opts.onCellClick(8, 8);
    expect([r.state.board[7][7], r.state.board[8][8]]).toEqual([1, 2]);
    clickTool('ERASE'); r.opts.onCellClick(7, 7);
    expect(r.state.board[7][7]).toBe(0);
    expect(r.opts.clickOccupied).toBe(true); // the renderer must deliver clicks on occupied cells, or Erase never fires
  });

  it('auto tool alternates black/white and sets the side to move', async () => {
    editorBoot(); await settle();
    const r = renderers[0];
    clickTool('AUTO');
    r.opts.onCellClick(7, 7); r.opts.onCellClick(8, 8); r.opts.onCellClick(6, 6);
    expect([r.state.board[7][7], r.state.board[8][8], r.state.board[6][6]]).toEqual([1, 2, 1]);
    expect($('ed-tomove').value).toBe('WHITE');
  });

  it('auto stays in step after erasing: the next stone takes the colour the counts imply (#506)', async () => {
    editorBoot(); await settle();
    const r = renderers[0];
    r.opts.onCellClick(7, 7); r.opts.onCellClick(8, 8); r.opts.onCellClick(6, 6); // B W B
    clickTool('ERASE'); r.opts.onCellClick(8, 8);                                     // drop the white → B B
    clickTool('AUTO'); r.opts.onCellClick(9, 9);
    expect(r.state.board[9][9]).toBe(2);   // 2 black, 0 white → white
    r.opts.onCellClick(10, 10);
    expect(r.state.board[10][10]).toBe(2); // 2 black, 1 white → white again
    r.opts.onCellClick(11, 11);
    expect(r.state.board[11][11]).toBe(1);
    expect(r.state.myColor).toBe('WHITE'); // hover preview follows the next auto colour
  });

  it('the last placed stone carries the renderer last-move marker; erasing it moves the marker back (#506)', async () => {
    editorBoot(); await settle();
    const r = renderers[0];
    expect(r.state.lastMove).toBeNull();
    r.opts.onCellClick(7, 7);
    expect(r.state.lastMove).toEqual({ x: 7, y: 7 });
    r.opts.onCellClick(8, 8);
    expect(r.state.lastMove).toEqual({ x: 8, y: 8 });
    clickTool('ERASE'); r.opts.onCellClick(8, 8);
    expect(r.state.lastMove).toEqual({ x: 7, y: 7 });
    clickTool('WALL'); r.opts.onCellClick(7, 7); // a wall over the stone removes it too
    expect(r.state.lastMove).toBeNull();
    clickTool('ANSWER'); // the answer tool's own cells keep their marker; with no answer yet: none
    expect(r.state.lastMove).toBeNull();
  });

  it('wall toggles, portal needs two clicks, erase removes a whole portal', async () => {
    editorBoot(); await settle();
    const r = renderers[0];
    clickTool('WALL'); r.opts.onCellClick(1, 1);
    expect(r.state.board[1][1]).toBe(-1);
    r.opts.onCellClick(1, 1);
    expect(r.state.board[1][1]).toBe(0);
    clickTool('PORTAL'); r.opts.onCellClick(2, 2);
    expect(r.state.portals).toHaveLength(0);
    r.opts.onCellClick(5, 5);
    expect(r.state.portals).toEqual([{ a: { x: 2, y: 2 }, b: { x: 5, y: 5 } }]);
    expect([r.state.board[2][2], r.state.board[5][5]]).toEqual([-2, -2]);
    clickTool('ERASE'); r.opts.onCellClick(5, 5);
    expect(r.state.portals).toHaveLength(0);
    expect(r.state.board[2][2]).toBe(0);
  });

  const typeImport = (text) => {
    $('ed-import').value = text;
    $('ed-import').dispatchEvent(new Event('input', { bubbles: true }));
  };

  it('typing setup text updates the board live after a ~300 ms debounce; no apply button (#506)', async () => {
    editorBoot(); await settle();
    const r = renderers[0];
    expect($('ed-import-btn')).toBeNull();
    jest.useFakeTimers();
    try {
      typeImport('h8 i9 h10 wall: a1 portal: b2 c3');
      jest.advanceTimersByTime(200);
      expect(r.state.board[7][7]).toBe(0); // still debouncing
      jest.advanceTimersByTime(150);
      expect(r.state.board[7][7]).toBe(1);
      expect(r.state.board[6][8]).toBe(2);
      expect(r.state.board[14][0]).toBe(-1);
      expect(r.state.portals).toHaveLength(1);
      expect(r.state.lastMove).toEqual({ x: 7, y: 5 }); // h10 = last stone in the text
      expect($('ed-tomove').value).toBe('WHITE');
      // Rapid typing parses once, with the final text.
      typeImport('h8'); jest.advanceTimersByTime(100);
      typeImport('h8 j9'); jest.advanceTimersByTime(300);
      expect(r.state.board[7][7]).toBe(1);
      expect(r.state.board[6][9]).toBe(2);
      expect(r.state.board[14][0]).toBe(0);
    } finally { jest.useRealTimers(); }
  });

  it('malformed text shows an inline alert naming the bad token and keeps the last valid board; no window.alert (#506)', async () => {
    editorBoot(); await settle();
    const r = renderers[0];
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.useFakeTimers();
    try {
      typeImport('h8 i9'); jest.advanceTimersByTime(300);
      expect($('ed-import-err').hidden).toBe(true);
      expect($('ed-import').getAttribute('aria-invalid')).not.toBe('true');
      typeImport('h8 i99 z30'); jest.advanceTimersByTime(300);
      const err = $('ed-import-err');
      expect(err.hidden).toBe(false);
      expect(err.getAttribute('role')).toBe('alert');
      expect(err.textContent).toBe('puzzles.import_bad_token{"token":"I99, Z30","size":15}');
      expect($('ed-import').getAttribute('aria-invalid')).toBe('true');
      expect($('ed-import').getAttribute('aria-describedby')).toContain('ed-import-err');
      expect(r.state.board[7][7]).toBe(1); // last valid board kept
      expect(r.state.board[6][8]).toBe(2);
      expect($('ed-result').hidden).toBe(true); // the notice sits by the field, not the form footer
      typeImport('h8 i9 j10'); jest.advanceTimersByTime(300);
      expect(err.hidden).toBe(true);
      expect($('ed-import').getAttribute('aria-invalid')).not.toBe('true');
      expect(r.state.board[5][9]).toBe(1);
      expect(alertSpy).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); alertSpy.mockRestore(); }
  });

  it('empty or coordinate-free text leaves the stones placed by hand alone (#506)', async () => {
    editorBoot(); await settle();
    const r = renderers[0];
    r.opts.onCellClick(3, 3);
    jest.useFakeTimers();
    try {
      typeImport('wall:'); jest.advanceTimersByTime(300);
      typeImport(''); jest.advanceTimersByTime(300);
    } finally { jest.useRealTimers(); }
    expect(r.state.board[3][3]).toBe(1);
    expect($('ed-import-err').hidden).toBe(true);
  });

  it('the answer tool appends labels to the active answer line (final_move keeps one)', async () => {
    editorBoot(); await settle();
    const r = renderers[0];
    clickTool('AUTO'); r.opts.onCellClick(7, 7); // a stone: answers cannot land on it
    clickTool('ANSWER');
    r.opts.onCellClick(1, 6); r.opts.onCellClick(2, 6); r.opts.onCellClick(7, 7);
    expect(document.querySelector('.pz-answer').value).toBe('B9, C9');
    $('ed-mode').value = 'final_move'; $('ed-mode').dispatchEvent(new Event('change'));
    r.opts.onCellClick(3, 6);
    expect(document.querySelector('.pz-answer').value).toBe('D9');
  });

  it('tags are capped at three', async () => {
    editorBoot(); await settle();
    [...document.querySelectorAll('#ed-tags .pz-chip')].slice(0, 4).forEach((b) => b.click());
    expect(document.querySelectorAll('#ed-tags .pz-chip[aria-pressed="true"]')).toHaveLength(3);
  });

  it('shrinking the board drops stones that no longer fit', async () => {
    editorBoot(); await settle();
    clickTool('AUTO'); renderers[0].opts.onCellClick(16, 16); // only possible once size > 15
    // a 15-board cannot be clicked at 16,16, but a stone placed on a 17-board must vanish when going back
    $('ed-size').value = '17'; $('ed-size').dispatchEvent(new Event('change'));
    renderers[0].opts.onCellClick(16, 16);
    expect(renderers[0].state.board[16][16]).toBe(1);
    $('ed-size').value = '15'; $('ed-size').dispatchEvent(new Event('change'));
    expect(renderers[0].state.board).toHaveLength(15);
  });

  it('submits the body (coords parsed against the board size) and maps server errors', async () => {
    editorBoot((u, o) => (o && o.method === 'POST' ? fail(400, { code: 'PUZZLE_STONES_INVALID' }) : null)); await settle();
    clickTool('AUTO'); renderers[0].opts.onCellClick(7, 7);
    clickTool('AUTO'); renderers[0].opts.onCellClick(6, 6);
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
    boot('editor', '../js/puzzle-editor.js', (u) => (u.includes('/rankings/me') ? ok({ userId: 'u1' }) : u.includes('/api/puzzles/p9') ? ok({ puzzle: P }) : ok({ id: 'p9', status: 'pending' })));
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
    boot('mine', '../js/puzzles-mine.js', (u) => (u.includes('/review') ? ok({ pagination: { total: 3 } }) : ok({ puzzles: MINE, canReview: true, pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } })));
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
    boot('mine', '../js/puzzles-mine.js', (u) => ok({ puzzles: MINE, canReview: false, pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } }));
    await settle();
    expect($('mn-review').hidden).toBe(true);
    expect(errs).toEqual([]); // init() is async: a ReferenceError there would only surface as an unhandled rejection
    expect(global.fetch.mock.calls.some(([u]) => u.includes('/review'))).toBe(false); // no probe → no 403 in the console
  });
});

describe('my puzzles — number + rename (#333/#334)', () => {
  const MINE = [{ id: 'a', number: 7, title: 'Cũ', status: 'approved', level: 'easy', rule: 'caro', boardSize: 15, reviewNote: '' }];
  const bootMine = (patch) => boot('mine', '../js/puzzles-mine.js', (u, o) => (o && o.method === 'PATCH' ? patch(u, o)
    : ok({ puzzles: MINE.map((p) => ({ ...p })), canReview: false, pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } })));

  it('shows "Title #n"; Rename PATCHes /title and updates the name in place without reloading', async () => {
    bootMine((u, o) => ok({ id: 'a', title: JSON.parse(o.body).title }));
    await settle();
    const row = () => document.querySelector('#mn-list .prow');
    expect(row().querySelector('b').textContent).toBe('Cũ #7');
    [...row().querySelectorAll('button')].find((b) => b.textContent === 'puzzles.rename').click();
    const input = row().querySelector('input.pz-rename');
    expect(input.value).toBe('Cũ');
    input.value = 'Mới';
    [...row().querySelectorAll('button')].find((b) => b.textContent === 'puzzles.save').click();
    await settle();
    const patch = global.fetch.mock.calls.find(([, o]) => o && o.method === 'PATCH');
    expect(patch[0]).toBe('/api/puzzles/a/title');
    expect(JSON.parse(patch[1].body)).toEqual({ title: 'Mới' });
    expect(row().querySelector('b').textContent).toBe('Mới #7');
    expect(row().querySelector('input')).toBeNull();
  });

  it('rename editor: Cancel and Esc restore the name, Enter saves, row is flagged while editing', async () => {
    bootMine((u, o) => ok({ id: 'a', title: JSON.parse(o.body).title }));
    await settle();
    const row = () => document.querySelector('#mn-list .prow');
    const open = () => [...row().querySelectorAll('button')].find((b) => b.textContent === 'puzzles.rename').click();
    open();
    expect(row().classList.contains('pz-mine--editing')).toBe(true);
    [...row().querySelectorAll('button')].find((b) => b.textContent === 'modal.btn_cancel').click();
    expect(row().querySelector('input')).toBeNull();
    expect(row().classList.contains('pz-mine--editing')).toBe(false);
    open();
    row().querySelector('input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(row().querySelector('input')).toBeNull();
    open();
    const input = row().querySelector('input');
    input.value = 'Enter';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
    expect(row().querySelector('b').textContent).toBe('Enter #7');
  });

  it('a rejected rename shows the translated error and keeps the editor open', async () => {
    bootMine(() => fail(400, { code: 'PUZZLE_TITLE_INVALID' }));
    await settle();
    const row = document.querySelector('#mn-list .prow');
    [...row.querySelectorAll('button')].find((b) => b.textContent === 'puzzles.rename').click();
    [...row.querySelectorAll('button')].find((b) => b.textContent === 'puzzles.save').click();
    await settle();
    expect(row.textContent).toContain('err.puzzle_title_invalid');
    expect(row.querySelector('input.pz-rename')).not.toBeNull();
    expect(row.querySelector('input.pz-rename').getAttribute('aria-invalid')).toBe('true');
    expect(row.querySelector('[role=alert]')).not.toBeNull();
  });
});

describe('my puzzles — paging (#279)', () => {
  const row = (i) => ({ id: 'r' + i, title: 'T' + i, status: 'approved', level: 'easy', rule: 'caro', boardSize: 15, reviewNote: '' });
  const pageOf = (n) => ({ page: n, limit: 20, total: 45, totalPages: 3 });

  it('45 puzzles: page 1 shows 20 + a pager; Sau requests page 2 and shows that page\'s rows; total stays 45', async () => {
    boot('mine', '../js/puzzles-mine.js', (u) => ok(u.includes('page=2')
      ? { puzzles: [row(20), row(21)], canReview: false, pagination: pageOf(2) }
      : { puzzles: Array.from({ length: 20 }, (_, i) => row(i)), canReview: false, pagination: pageOf(1) }));
    await settle();
    expect(document.querySelectorAll('#mn-list .prow')).toHaveLength(20);
    expect($('mn-count').textContent).toContain('"n":45');
    const [prev, next] = document.querySelectorAll('#mn-pager button');
    expect(prev.disabled).toBe(true);
    next.click(); await settle();
    expect(global.fetch.mock.calls.pop()[0]).toBe('/api/puzzles/mine?page=2');
    expect(document.querySelector('#mn-list .prow b').textContent).toBe('T20');
    expect($('mn-pager').textContent).toContain('2 / 3');
  });

  it('a single page renders no pager buttons', async () => {
    boot('mine', '../js/puzzles-mine.js', () => ok({ puzzles: [row(0)], canReview: false, pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } }));
    await settle();
    expect(document.querySelectorAll('#mn-pager button')).toHaveLength(0);
  });
});

describe('editor hints — plain wording (#278)', () => {
  const i18n = require('fs').readFileSync(require('path').join(__dirname, '../js/i18n.js'), 'utf8');
  it.each([
    ["puzzles.counts_equal", /lượt Đen \(hai bên bằng quân\)/, /Black to move \(equal stones\)/],
    ["puzzles.counts_black_more", /lượt Trắng \(Đen nhiều hơn 1 quân\)/, /White to move \(Black has one more\)/],
    ["puzzles.tool_portal", /nối thành một cặp/, /link them as a pair/],
  ])('%s is a plain sentence in vi and en', (key, vi, en) => {
    const lines = i18n.split('\n').filter((l) => l.includes("'" + key + "'"));
    expect(lines).toHaveLength(2);
    expect(vi.test(lines[0])).toBe(true);
    expect(en.test(lines[1])).toBe(true);
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

  it('delete asks first (cancel = no request); confirmed DELETE removes the puzzle and moves to the next', async () => {
    reviewBoot((u, o) => (o && o.method === 'DELETE' ? ok({ id: 'q1', deleted: true }) : null)); await settle();
    window.confirm = jest.fn(() => false);
    $('rv-delete').click(); await settle();
    expect(global.fetch.mock.calls.some(([, o]) => o && o.method === 'DELETE')).toBe(false);

    window.confirm = jest.fn(() => true);
    $('rv-delete').click(); await settle();
    const [url] = global.fetch.mock.calls.find(([, o]) => o && o.method === 'DELETE');
    expect(url).toBe('/api/puzzles/q1');
    expect($('rv-title').textContent).toBe('Hai');
    expect(document.querySelectorAll('#rv-list .prow')).toHaveLength(1);
  });

  it('#331: shows each answer line\'s verdict; a breaking line flags the puzzle (row badge + note)', async () => {
    const withV = [
      { ...Q[0], answers: [[{ x: 1, y: 6 }], [{ x: 2, y: 6 }], [{ x: 3, y: 6 }]],
        verification: [{ status: 'verified', step: 3 }, { status: 'breaks', step: 2, reason: 'occupied' }, { status: 'unchecked', step: 1 }] },
      { ...Q[1], verification: [{ status: 'unchecked', step: 1 }] },
    ];
    reviewBoot(() => ok({ puzzles: withV, pagination: { total: 2 } })); await settle();
    const v = [...document.querySelectorAll('#rv-answers .pz-verdict')];
    expect(v.map((n) => n.className)).toEqual(['pz-verdict pz-verdict--verified', 'pz-verdict pz-verdict--breaks', 'pz-verdict pz-verdict--unchecked']);
    expect(v[1].textContent).toBe(' · puzzles.rv_v_breaks_occupied{"n":2}');
    expect($('rv-verify').hidden).toBe(false);
    const rows = document.querySelectorAll('#rv-list .prow');
    expect(rows[0].textContent).toContain('puzzles.rv_v_flag_badge');
    expect(rows[1].textContent).not.toContain('puzzles.rv_v_flag_badge');
    rows[1].click();
    expect($('rv-verify').hidden).toBe(true);
  });
});

describe('review — recent renames (#337)', () => {
  const R = { id: 1, puzzleId: 'p1', number: 7, status: 'approved', oldTitle: 'Cũ', newTitle: 'Mới', createdAt: '2026-10-23T01:00:00.000Z', by: { username: 'al', displayName: 'Al' } };
  const bootWith = (renames, total) => boot('review', '../js/puzzles-review.js', (u) => (u.includes('/renames')
    ? ok({ renames, pagination: { total } }) : ok({ puzzles: [], pagination: { total: 0 } })));

  it('lists old → new with a link to the puzzle, and says how many older ones are hidden', async () => {
    bootWith([R], 3); await settle();
    expect($('rv-renames').hidden).toBe(false);
    const row = $('rn-list').firstChild;
    expect(row.textContent).toContain('Cũ');
    expect(row.querySelector('a').textContent).toBe('Mới #7');
    expect(row.querySelector('a').getAttribute('href')).toBe('/puzzle/p1');
    expect($('rn-more').hidden).toBe(false);
  });
  it('stays hidden when there are no renames or the log is refused', async () => {
    bootWith([], 0); await settle();
    expect($('rv-renames').hidden).toBe(true);
  });
});

describe('editor — answer lines', () => {
  it('focusing another answer line keeps the DOM (typing is not lost) and switches the active line', async () => {
    boot('editor', '../js/puzzle-editor.js', (u) => (u.includes('/rankings/me') ? ok({ userId: 'u1' }) : ok({})));
    await settle();
    $('ed-add-answer').click();
    const [first, second] = document.querySelectorAll('.pz-answer');
    first.dispatchEvent(new Event('focus'));
    expect(document.querySelectorAll('.pz-answer')[0]).toBe(first); // same node: not re-rendered
    expect(first.classList.contains('is-active')).toBe(true);
    expect(second.classList.contains('is-active')).toBe(false);
  });
});

describe('Modern control hierarchy on mine & editor (#504)', () => {
  const raw = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

  it('mine and editor pages use body.pz-page, zero classic .pbtn/.pchip, danger delete, and 1 raised primary even while renaming', async () => {
    for (const f of ['puzzles-mine.html', 'puzzle-editor.html']) {
      expect(raw(f)).toMatch(/<body class="pl pz-page">/);
    }

    // /puzzles/mine with admin review link, pager, approved row, and open inline rename
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: 'm' + i, number: i + 1, title: 'T' + i, status: 'approved', level: 'easy', rule: 'caro', boardSize: 15, reviewNote: '',
    }));
    boot('mine', '../js/puzzles-mine.js', (u) => (u.includes('/review')
      ? ok({ pagination: { total: 2 } })
      : ok({ puzzles: rows, canReview: true, pagination: { page: 1, limit: 20, total: 25, totalPages: 2 } })));
    await settle();
    const firstRow = document.querySelector('#mn-list .pz-mine');
    const delBtn = [...firstRow.querySelectorAll('button')].find((b) => b.textContent === 'puzzles.delete');
    expect(delBtn.classList.contains('pz-tbtn--danger')).toBe(true);
    [...firstRow.querySelectorAll('button')].find((b) => b.textContent === 'puzzles.rename').click();
    expect(document.querySelectorAll('.pbtn, .pchip, .ptab')).toHaveLength(0);
    // Inline Save is a tonal pill, keeping "Đăng puzzle mới" as the sole raised primary on /puzzles/mine
    expect(document.querySelectorAll('.pz-btn--primary')).toHaveLength(1);
    expect(firstRow.querySelector('.pz-rename-form .pz-tbtn')).not.toBeNull();
    expect(document.querySelectorAll('#mn-pager .pz-tbtn--quiet')).toHaveLength(2);

    // /puzzles/new with 2 answers: 1 raised primary (#ed-submit), danger icon trash, segmented tools, tonal tag chips, 0 .pbtn
    boot('editor', '../js/puzzle-editor.js', (u) => (u.includes('/rankings/me') ? ok({ userId: 'u1' }) : ok({})));
    await settle();
    $('ed-add-answer').click();
    expect(document.querySelectorAll('.pbtn, .pchip, .ptab')).toHaveLength(0);
    expect([...document.querySelectorAll('.pz-btn--primary')].map((n) => n.id)).toEqual(['ed-submit']);
    expect(document.querySelectorAll('#ed-answers .pz-tbtn--danger.pz-tbtn--icon')).toHaveLength(2);
    expect(document.querySelectorAll('#ed-tools .pz-seg__opt')).toHaveLength(5);
    expect(document.querySelectorAll('#ed-tags .pz-chip')).toHaveLength(5);
  });
});
