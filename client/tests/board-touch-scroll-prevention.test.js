/**
 * TODO.md #104 / docs/fix-log/*-todo-104-mobile-chatbox-scroll-on-board-tap.md
 *
 * board.js's `_onTouchEnd` used to call `e.preventDefault()` AFTER the
 * `!this.interactive || !this.isMyTurn || !this.onCellClick` early-return
 * guard, so a touchend on the board during the opponent's turn (or while
 * spectating, or pre-game) never suppressed the browser's default
 * post-touch behavior: a synthetic `click` ~300ms later (which could focus
 * the chat input) and, if the finger moved slightly, a page scroll.
 *
 * This guards the fix: `preventDefault()` must run on every `touchend`,
 * regardless of `interactive`/`isMyTurn`/`onCellClick` state.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BOARD_JS_PATH = path.join(__dirname, '..', 'js', 'board.js');
const BOARD_JS_SOURCE = fs.readFileSync(BOARD_JS_PATH, 'utf8');

function loadBoardRenderer() {
  delete window.BoardRenderer;
  // board.js is a plain (non-module) script that assigns `window.BoardRenderer`;
  // evaluate it fresh in this test's jsdom global each time, matching how the
  // browser loads it via a <script> tag.
  // eslint-disable-next-line no-eval
  window.eval(BOARD_JS_SOURCE);
  return window.BoardRenderer;
}

function makeTouchEndEvent(x = 50, y = 50) {
  return {
    preventDefault: jest.fn(),
    changedTouches: [{ clientX: x, clientY: y }],
  };
}

describe('BoardRenderer#_onTouchEnd (TODO #104)', () => {
  let canvas;
  let BoardRenderer;

  beforeEach(() => {
    document.body.innerHTML = '<canvas id="board"></canvas>';
    canvas = document.getElementById('board');
    BoardRenderer = loadBoardRenderer();
  });

  test('calls preventDefault even when not interactive (spectator / pre-game)', () => {
    const renderer = new BoardRenderer(canvas, { boardSize: 15, onCellClick: jest.fn() });
    renderer.interactive = false;
    renderer.isMyTurn = false;

    const e = makeTouchEndEvent();
    renderer._onTouchEnd(e);

    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  test('calls preventDefault even when interactive but not the player\'s turn', () => {
    const renderer = new BoardRenderer(canvas, { boardSize: 15, onCellClick: jest.fn() });
    renderer.interactive = true;
    renderer.isMyTurn = false;

    const e = makeTouchEndEvent();
    renderer._onTouchEnd(e);

    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  test('calls preventDefault when onCellClick is not set (no handler wired yet)', () => {
    const renderer = new BoardRenderer(canvas, { boardSize: 15 });
    renderer.interactive = true;
    renderer.isMyTurn = true;

    const e = makeTouchEndEvent();
    renderer._onTouchEnd(e);

    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  test('calls preventDefault on the player\'s own turn too (no regression)', () => {
    const onCellClick = jest.fn();
    const renderer = new BoardRenderer(canvas, { boardSize: 15, onCellClick });
    renderer.interactive = true;
    renderer.isMyTurn = true;
    renderer.board = Array.from({ length: 15 }, () => Array(15).fill(0));

    const e = makeTouchEndEvent();
    renderer._onTouchEnd(e);

    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });
});
