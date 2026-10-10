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

describe('solve page', () => {
  const solveBoot = (over = {}) => boot({
    html: SOLVE_HTML,
    scripts: ['../js/puzzle.js'],
    fetchImpl: (url, opts) => {
      if (over.fetch) { const r = over.fetch(url, opts); if (r) return r; }
      if (url.includes('/solve')) return ok({ correct: false });
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
    expect(interactive).toBe(true);
  });

  it('never asks for answers and clicking the board adds the solver\'s move in their colour', async () => {
    solveBoot(); await settle();
    renderers[0].opts.onCellClick(1, 6);
    renderers[0].opts.onCellClick(7, 7); // occupied → ignored
    expect(renderers[0].state.board[6][1]).toBe(1);
    expect(document.getElementById('pz-input').value).toBe('B9');
  });

  it('submits typed coordinates (letters or sequence numbers) as labels and shows "wrong"', async () => {
    solveBoot(); await settle();
    document.getElementById('pz-input').value = '122, h8x';
    document.getElementById('pz-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(document.getElementById('pz-result').textContent).toBe('err.puzzle_moves_invalid');
    expect(global.fetch.mock.calls.some(([u]) => u.includes('/solve'))).toBe(false);

    document.getElementById('pz-input').value = '122, 133';
    document.getElementById('pz-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    const call = global.fetch.mock.calls.find(([u]) => u.includes('/solve'));
    expect(JSON.parse(call[1].body)).toEqual({ moves: ['B9', 'M9'] }); // stride 20 on 15x15: 122 = row 7 col 2, 133 = row 7 col 13
    expect(document.getElementById('pz-result').textContent).toBe('puzzles.wrong');
  });

  it('a correct answer locks the board and offers the next puzzle', async () => {
    solveBoot({ fetch: (u) => (u.includes('/solve') ? ok({ correct: true }) : null) }); await settle();
    renderers[0].opts.onCellClick(1, 6);
    document.getElementById('pz-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(document.getElementById('pz-result').textContent).toBe('puzzles.correct');
    expect(document.getElementById('pz-next').hidden).toBe(false);
    expect(renderers[0].state.interactive).toBe(false);
  });

  it('final_move keeps a single cell', async () => {
    solveBoot({ fetch: (u) => (u.endsWith('/p1') ? ok({ puzzle: { ...PUZZLE, mode: 'final_move' } }) : null) }); await settle();
    renderers[0].opts.onCellClick(1, 6);
    renderers[0].opts.onCellClick(2, 6);
    expect(document.getElementById('pz-input').value).toBe('C9');
  });

  it('a guest sees the login hint instead of calling solve', async () => {
    solveBoot({ fetch: (u) => (u.includes('/rankings/me') ? fail(401, {}) : null) }); await settle();
    renderers[0].opts.onCellClick(1, 6);
    document.getElementById('pz-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(document.getElementById('pz-login').hidden).toBe(false);
    expect(global.fetch.mock.calls.some(([u]) => u.includes('/solve'))).toBe(false);
  });

  it('shows the translated error for an unknown puzzle', async () => {
    solveBoot({ fetch: (u) => (u.endsWith('/p1') ? fail(404, { code: 'PUZZLE_NOT_FOUND' }) : null) }); await settle();
    expect(document.getElementById('pz-error').hidden).toBe(false);
    expect(document.getElementById('pz-error').textContent).toBe('err.puzzle_not_found');
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
    const chip = [...document.querySelectorAll('#pz-levels .pchip')].find((b) => b.textContent === 'puzzles.level_hard');
    chip.click(); await settle();
    expect(global.fetch.mock.calls.pop()[0]).toBe('/api/puzzles?level=hard');
    chip.click(); await settle();
    expect(global.fetch.mock.calls.pop()[0]).toBe('/api/puzzles?');
  });
});

describe('solve page — submit availability', () => {
  it('the Check button is enabled before any move, so typed coordinates can be submitted', async () => {
    boot({ html: SOLVE_HTML, scripts: ['../js/puzzle.js'], fetchImpl: (u) => (u.includes('/rankings/me') ? ok({}) : ok({ puzzle: PUZZLE })) });
    await settle();
    expect(document.getElementById('pz-submit').disabled).toBe(false);
  });
});
