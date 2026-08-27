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
  // globalAlpha seeded at the real Canvas2D default (1) — a piece-drawing
  // test needs to tell "never touched" from "touched" as a real number, not
  // as this proxy's auto-vivified jest.fn() for an untouched property.
  const store = { globalAlpha: 1 };
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

  test('draws at full opacity — indistinguishable from a confirmed stone (TODO.md #155)', () => {
    const renderer = makeRenderer(BoardRenderer, { displayMode: 'paper' });
    const ctx = makeFakeCtx();
    renderer.ctx = ctx;
    let alphaDuringPieceDraw = null;
    renderer._drawBlackPiece = jest.fn(() => { alphaDuringPieceDraw = ctx.globalAlpha; });

    renderer._drawOptimisticStone(1, 1, 'BLACK', false);

    // _drawOptimisticStone no longer touches globalAlpha at all — the piece
    // draw sees the same default(1) a confirmed stone would.
    expect(alphaDuringPieceDraw).toBe(1);
  });

  test('the normal (non-warning) case draws no ring at all — nothing to tell it apart from a real stone', () => {
    const renderer = makeRenderer(BoardRenderer, { displayMode: 'paper' });
    const ctx = makeFakeCtx();
    renderer.ctx = ctx;
    renderer._drawBlackPiece = jest.fn();

    renderer._drawOptimisticStone(1, 1, 'BLACK', false);

    expect(ctx.setLineDash).not.toHaveBeenCalled();
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  test('warning=true draws a thin SOLID ring (retry cue), not the old dashed one', () => {
    const renderer = makeRenderer(BoardRenderer, { displayMode: 'paper' });
    const ctx = makeFakeCtx();
    renderer.ctx = ctx;
    renderer._drawBlackPiece = jest.fn();

    renderer._drawOptimisticStone(1, 1, 'BLACK', true);

    expect(ctx.setLineDash).not.toHaveBeenCalled(); // solid, not dashed
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalled();
    expect(ctx.lineWidth).toBeLessThanOrEqual(1.5); // deliberately faint
    expect(ctx.strokeStyle).toContain('196, 130, 40'); // the amber warning color
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
