/**
 * TODO.md #153 — BoardRenderer's optimistic (not-yet-confirmed) stone.
 *
 * Before this fix, `onCellClick` only emitted the move and drew nothing;
 * the placed stone — including the mover's OWN — only appeared once the
 * server's `game:moved` broadcast came back, exposing the full round trip
 * (~0.5s for the affected players) as visible lag on every single move.
 *
 * These tests cover BoardRenderer's half: the overlay is a field entirely
 * separate from `this.board` (driven by GameUI.sendMove's ack/timeout
 * lifecycle, not by gameState snapshots), it looks exactly like a confirmed
 * piece of the active look (#155), and only the retry warning adds a ring.
 *
 * Rewritten for the SVG renderer (#216): assertions read the SVG overlay
 * layer instead of canvas calls.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BOARD_JS_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'board.js'), 'utf8');

function load() {
  delete window.BoardRenderer;
  delete window.BoardPrefs;
  localStorage.clear();
  // eslint-disable-next-line no-eval
  window.eval(BOARD_JS_SOURCE);
  return window.BoardRenderer;
}

const empty = (n = 15) => Array.from({ length: n }, () => Array(n).fill(0));

function makeRenderer(opts = {}) {
  const BoardRenderer = load();
  document.body.innerHTML = '<div id="wrap"><canvas id="board"></canvas></div>';
  const r = new BoardRenderer(document.getElementById('board'), { boardSize: 15, onCellClick: jest.fn(), ...opts });
  r.setState({ board: empty() });
  return r;
}

const overlay = (r) => r.svg.querySelector('.gboard__ov');
const optimistic = (r) => overlay(r).querySelector('.gboard__optimistic');

describe('BoardRenderer#setOptimisticStone / markOptimisticWarning', () => {
  test('a <canvas> is swapped in place for an <svg> keeping its id', () => {
    const r = makeRenderer();
    expect(r.svg.tagName.toLowerCase()).toBe('svg');
    expect(document.getElementById('board')).toBe(r.svg);
    expect(document.querySelector('canvas')).toBeNull();
  });

  test('setOptimisticStone stores the stone and draws it immediately', () => {
    const r = makeRenderer();
    r.setOptimisticStone({ x: 3, y: 4, color: 'BLACK' });
    expect(r.optimisticStone).toEqual({ x: 3, y: 4, color: 'BLACK' });
    const g = optimistic(r);
    expect(g).not.toBeNull();
    expect(g.getAttribute('data-x')).toBe('3');
    expect(g.getAttribute('data-y')).toBe('4');
  });

  test('setOptimisticStone(null) clears it (the rollback path)', () => {
    const r = makeRenderer();
    r.setOptimisticStone({ x: 3, y: 4, color: 'BLACK' });
    r.setOptimisticStone(null);
    expect(r.optimisticStone).toBeNull();
    expect(optimistic(r)).toBeNull();
  });

  test('markOptimisticWarning flips warning without moving the stone', () => {
    const r = makeRenderer();
    r.setOptimisticStone({ x: 3, y: 4, color: 'WHITE' });
    r.markOptimisticWarning();
    expect(r.optimisticStone).toEqual({ x: 3, y: 4, color: 'WHITE', warning: true });
    expect(optimistic(r).getAttribute('data-x')).toBe('3');
  });

  test('markOptimisticWarning is a no-op if the stone was already cleared', () => {
    const r = makeRenderer();
    r.markOptimisticWarning();
    expect(r.optimisticStone).toBeNull();
    expect(optimistic(r)).toBeNull();
  });

  test('survives a setState() that does not mention it (e.g. a resize redraw)', () => {
    const r = makeRenderer();
    r.setOptimisticStone({ x: 1, y: 1, color: 'BLACK' });
    r.setState({ isMyTurn: false });
    expect(optimistic(r)).not.toBeNull();
  });

  test('is never written into the confirmed board', () => {
    const r = makeRenderer();
    r.setOptimisticStone({ x: 2, y: 2, color: 'BLACK' });
    expect(r.board[2][2]).toBe(0);
  });
});

describe('optimistic stone looks like a confirmed piece (#155)', () => {
  // Draw the same move confirmed on a second board and compare the piece markup.
  function confirmedMarkup(theme, value) {
    const r = makeRenderer();
    window.BoardPrefs.set({ theme });
    const b = empty(); b[4][3] = value;
    r.setState({ board: b });
    // The piece is the only shape drawn after the coordinate texts for this cell.
    return r.svg.innerHTML;
  }

  test.each([
    ['paper', 'BLACK', 1],
    ['paper', 'WHITE', 2],
    ['stone', 'BLACK', 1],
    ['stone', 'WHITE', 2],
  ])('%s + %s: same shapes as the confirmed piece, no extra ring', (theme, color, value) => {
    const confirmed = confirmedMarkup(theme, value);
    const r = makeRenderer();
    window.BoardPrefs.set({ theme });
    r.setOptimisticStone({ x: 3, y: 4, color });
    const inner = optimistic(r).innerHTML;
    expect(inner.length).toBeGreaterThan(0);
    expect(confirmed).toContain(inner); // identical markup exists in the confirmed render
    expect(optimistic(r).querySelector('.gboard__warning')).toBeNull();
    expect(optimistic(r).getAttribute('opacity')).toBeNull(); // full opacity
  });

  test('warning=true adds one thin solid ring (retry cue), not a dashed one', () => {
    const r = makeRenderer();
    r.setOptimisticStone({ x: 3, y: 4, color: 'BLACK', warning: true });
    const ring = optimistic(r).querySelector('.gboard__warning');
    expect(ring).not.toBeNull();
    expect(ring.getAttribute('stroke-dasharray')).toBeNull();
  });

  test('the look follows BoardPrefs live (boardprefschange)', () => {
    const r = makeRenderer();
    r.setOptimisticStone({ x: 3, y: 4, color: 'BLACK' });
    expect(optimistic(r).innerHTML).toContain('<path');      // paper X
    window.BoardPrefs.set({ theme: 'stone' });
    expect(optimistic(r).innerHTML).toContain('<circle');    // stone
    expect(optimistic(r).innerHTML).not.toContain('<path');
  });
});
