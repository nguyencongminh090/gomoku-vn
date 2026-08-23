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
 * lifecycle, not by gameState snapshots), it renders visibly differently
 * from a confirmed stone, and it dispatches through the same per-mode
 * piece-drawing code a confirmed stone uses so it never drifts from what
 * "a real stone" looks like.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BOARD_JS_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'board.js'), 'utf8');

function loadBoardRenderer() {
  delete window.BoardRenderer;
  // eslint-disable-next-line no-eval
  window.eval(BOARD_JS_SOURCE);
  return window.BoardRenderer;
}

/**
 * A canvas 2D context that survives a full `_draw()` pass without needing to
 * hand-enumerate every method board.js happens to call: any method access
 * auto-vivifies into a no-op jest.fn(), and `createRadialGradient` (the one
 * call whose return value is actually used, via `.addColorStop()`) gets a
 * matching stub. Property sets (fillStyle, lineWidth, ...) just store.
 */
function makeFakeCtx() {
  const store = {};
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'createRadialGradient') {
        return () => ({ addColorStop: jest.fn() });
      }
      if (prop in store) return store[prop];
      const fn = jest.fn();
      store[prop] = fn;
      return fn;
    },
    set(_target, prop, value) {
      store[prop] = value;
      return true;
    },
  });
}

function makeRenderer(BoardRenderer, opts = {}) {
  document.body.innerHTML = '<canvas id="board"></canvas>';
  const canvas = document.getElementById('board');
  const renderer = new BoardRenderer(canvas, { boardSize: 15, onCellClick: jest.fn(), ...opts });
  // Real geometry computation needs layout (offsetHeight etc.) jsdom doesn't
  // provide; every other board test in this repo sidesteps it by driving
  // internals directly rather than through resize() — same approach here.
  renderer.geo = { cellSize: 30, originX: 10, originY: 10, boardSize: 15 };
  renderer._theme = {
    bg: '#fff', accentRgb: '0,0,0', inkRgb: '0,0,0', pendingRgb: '72, 135, 95',
    highlightRgb: '255, 234, 0', wallMortarRgb: '0,0,0', wallDarkRgb: '0,0,0',
    wallBaseRgb: '0,0,0', wallLightRgb: '0,0,0',
  };
  return renderer;
}

describe('BoardRenderer#setOptimisticStone / markOptimisticWarning', () => {
  let BoardRenderer;
  beforeEach(() => { BoardRenderer = loadBoardRenderer(); });

  test('setOptimisticStone stores the stone and triggers an immediate redraw', () => {
    const renderer = makeRenderer(BoardRenderer);
    renderer._draw = jest.fn();

    renderer.setOptimisticStone({ x: 3, y: 4, color: 'BLACK' });

    expect(renderer.optimisticStone).toEqual({ x: 3, y: 4, color: 'BLACK' });
    expect(renderer._draw).toHaveBeenCalledTimes(1);
  });

  test('setOptimisticStone(null) clears it and still redraws (the rollback path)', () => {
    const renderer = makeRenderer(BoardRenderer);
    renderer.optimisticStone = { x: 1, y: 1, color: 'WHITE' };
    renderer._draw = jest.fn();

    renderer.setOptimisticStone(null);

    expect(renderer.optimisticStone).toBeNull();
    expect(renderer._draw).toHaveBeenCalledTimes(1);
  });

  test('markOptimisticWarning flips warning without moving the stone', () => {
    const renderer = makeRenderer(BoardRenderer);
    renderer.optimisticStone = { x: 2, y: 5, color: 'BLACK' };
    renderer._draw = jest.fn();

    renderer.markOptimisticWarning();

    expect(renderer.optimisticStone).toEqual({ x: 2, y: 5, color: 'BLACK', warning: true });
    expect(renderer._draw).toHaveBeenCalledTimes(1);
  });

  test('markOptimisticWarning is a no-op if the stone was already cleared', () => {
    // Real race: the ack timer and an incoming game:moved run independently,
    // so game:moved can clear the overlay a moment before the timeout fires.
    const renderer = makeRenderer(BoardRenderer);
    renderer.optimisticStone = null;
    renderer._draw = jest.fn();

    renderer.markOptimisticWarning();

    expect(renderer.optimisticStone).toBeNull();
    expect(renderer._draw).not.toHaveBeenCalled();
  });
});

describe('BoardRenderer#_drawOptimisticStone — visual dispatch', () => {
  let BoardRenderer;
  beforeEach(() => { BoardRenderer = loadBoardRenderer(); });

  test('paper mode + BLACK draws the black piece, not white or the stone-mode piece', () => {
    const renderer = makeRenderer(BoardRenderer, { displayMode: 'paper' });
    renderer.ctx = makeFakeCtx();
    renderer._drawBlackPiece = jest.fn();
    renderer._drawWhitePiece = jest.fn();
    renderer._drawStonePiece = jest.fn();

    renderer._drawOptimisticStone(3, 4, 'BLACK', false);

    expect(renderer._drawBlackPiece).toHaveBeenCalledWith(3, 4);
    expect(renderer._drawWhitePiece).not.toHaveBeenCalled();
    expect(renderer._drawStonePiece).not.toHaveBeenCalled();
  });

  test('paper mode + WHITE draws the white piece', () => {
    const renderer = makeRenderer(BoardRenderer, { displayMode: 'paper' });
    renderer.ctx = makeFakeCtx();
    renderer._drawBlackPiece = jest.fn();
    renderer._drawWhitePiece = jest.fn();
    renderer._drawStonePiece = jest.fn();

    renderer._drawOptimisticStone(3, 4, 'WHITE', false);

    expect(renderer._drawWhitePiece).toHaveBeenCalledWith(3, 4);
    expect(renderer._drawBlackPiece).not.toHaveBeenCalled();
  });

  test('stone display mode dispatches through the shared _drawStonePiece instead', () => {
    const renderer = makeRenderer(BoardRenderer, { displayMode: 'stone' });
    renderer.ctx = makeFakeCtx();
    renderer._drawBlackPiece = jest.fn();
    renderer._drawWhitePiece = jest.fn();
    renderer._drawStonePiece = jest.fn();

    renderer._drawOptimisticStone(2, 2, 'BLACK', false);

    expect(renderer._drawStonePiece).toHaveBeenCalledWith(2, 2, 'BLACK');
    expect(renderer._drawBlackPiece).not.toHaveBeenCalled();
  });

  test('draws at reduced opacity so it never reads as a confirmed stone', () => {
    const renderer = makeRenderer(BoardRenderer, { displayMode: 'paper' });
    const ctx = makeFakeCtx();
    renderer.ctx = ctx;
    let alphaDuringPieceDraw = null;
    renderer._drawBlackPiece = jest.fn(() => { alphaDuringPieceDraw = ctx.globalAlpha; });

    renderer._drawOptimisticStone(1, 1, 'BLACK', false);

    expect(alphaDuringPieceDraw).toBeLessThan(1);
    expect(alphaDuringPieceDraw).toBeGreaterThan(0);
  });

  test('the ring is drawn dashed, not solid — the "unconfirmed" cue', () => {
    const renderer = makeRenderer(BoardRenderer, { displayMode: 'paper' });
    const ctx = makeFakeCtx();
    renderer.ctx = ctx;
    renderer._drawBlackPiece = jest.fn();

    renderer._drawOptimisticStone(1, 1, 'BLACK', false);

    expect(ctx.setLineDash).toHaveBeenCalled();
    const dashPattern = ctx.setLineDash.mock.calls[0][0];
    expect(Array.isArray(dashPattern)).toBe(true);
    expect(dashPattern.length).toBeGreaterThan(0);
    expect(dashPattern.every((n) => n > 0)).toBe(true);
  });

  test('warning=true switches the ring color from the normal (green) pending color', () => {
    const renderer = makeRenderer(BoardRenderer, { displayMode: 'paper' });
    const ctx = makeFakeCtx();
    renderer.ctx = ctx;
    renderer._drawBlackPiece = jest.fn();

    renderer._drawOptimisticStone(1, 1, 'BLACK', false);
    const normalColor = ctx.strokeStyle;

    renderer._drawOptimisticStone(1, 1, 'BLACK', true);
    const warningColor = ctx.strokeStyle;

    expect(normalColor).toContain(renderer._theme.pendingRgb);
    expect(warningColor).not.toBe(normalColor);
  });
});

describe('BoardRenderer#_draw — optimistic stone wiring', () => {
  let BoardRenderer;
  beforeEach(() => { BoardRenderer = loadBoardRenderer(); });

  test('a set optimisticStone is drawn during a full _draw() pass', () => {
    const renderer = makeRenderer(BoardRenderer, { displayMode: 'paper' });
    renderer.ctx = makeFakeCtx();
    renderer.optimisticStone = { x: 5, y: 6, color: 'WHITE' };
    renderer._drawOptimisticStone = jest.fn();

    renderer._draw();

    expect(renderer._drawOptimisticStone).toHaveBeenCalledWith(5, 6, 'WHITE', false);
  });

  test('warning flag is forwarded as the fourth argument', () => {
    const renderer = makeRenderer(BoardRenderer, { displayMode: 'paper' });
    renderer.ctx = makeFakeCtx();
    renderer.optimisticStone = { x: 5, y: 6, color: 'WHITE', warning: true };
    renderer._drawOptimisticStone = jest.fn();

    renderer._draw();

    expect(renderer._drawOptimisticStone).toHaveBeenCalledWith(5, 6, 'WHITE', true);
  });

  test('no optimisticStone means no call at all — a confirmed board must never gain a phantom ring', () => {
    const renderer = makeRenderer(BoardRenderer, { displayMode: 'paper' });
    renderer.ctx = makeFakeCtx();
    renderer.optimisticStone = null;
    renderer._drawOptimisticStone = jest.fn();

    renderer._draw();

    expect(renderer._drawOptimisticStone).not.toHaveBeenCalled();
  });
});
