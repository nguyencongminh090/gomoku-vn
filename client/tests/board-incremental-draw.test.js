/**
 * TODO.md #378 — a move patches the board SVG instead of rebuilding it.
 *
 * `setState` after exactly one new stone (the `game:moved` path) used to run the full `_draw`
 * (~6.7 ms late game on a 4×-throttled phone). `_drawMove` now inserts the one stone and swaps
 * the last-move layers. The contract: the resulting markup is byte-identical to a full redraw
 * of the same state, for every look; anything that is not "one more stone" still redraws whole.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BOARD_JS_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'board.js'), 'utf8');
const N = 15;
const empty = () => Array.from({ length: N }, () => Array(N).fill(0));

function setup(prefs) {
  delete window.BoardRenderer;
  delete window.BoardPrefs;
  localStorage.clear();
  // eslint-disable-next-line no-eval
  window.eval(BOARD_JS_SOURCE);
  window.BoardPrefs.set(prefs);
  document.body.innerHTML = '<div id="wrap"><svg id="board"></svg></div>';
  const r = new window.BoardRenderer(document.getElementById('board'), { boardSize: N, onCellClick: jest.fn() });
  const game = { board: empty(), hist: [] };
  r.setState({ board: game.board, moveHistory: game.hist, lastMove: null });
  return { r, game };
}

// What GameUI.updateBoardState does after room-socket's game:moved mutates the board in place.
function play(r, game, x, y) {
  const color = game.hist.length % 2 ? 'WHITE' : 'BLACK';
  game.board[y][x] = color === 'BLACK' ? 1 : 2;
  game.hist.push({ x, y, color });
  r.setState({ board: game.board, moveHistory: game.hist, lastMove: { x, y }, isMyTurn: true });
}

function fullRedraw(r) {
  r._draw();
  return r.svg.innerHTML;
}

// Later stones land both after and before earlier ones in row-major order (overlap order matters).
const MOVES = [[7, 7], [8, 8], [6, 6], [7, 8], [0, 0], [14, 14], [7, 6], [8, 7]];

const LOOKS = [];
for (const theme of ['paper', 'stone']) {
  for (const coords of ['edge', 'cell']) {
    for (const showMoveNumbers of [false, true]) {
      for (const showLastMove of [true, false]) LOOKS.push({ theme, coords, showMoveNumbers, showLastMove });
    }
  }
}

describe('BoardRenderer one-move draw (#378)', () => {
  test.each(LOOKS.map((l) => [JSON.stringify(l), l]))('%s: patched markup equals a full redraw', (_, look) => {
    const { r, game } = setup(look);
    const drawSpy = jest.spyOn(r, '_draw');
    for (const [x, y] of MOVES) {
      play(r, game, x, y);
      const patched = r.svg.innerHTML;
      expect(fullRedraw(r)).toBe(patched);
    }
    // only the fullRedraw() calls above — setState itself never rebuilt
    expect(drawSpy).toHaveBeenCalledTimes(MOVES.length);
  });

  test('a move keeps the existing stone nodes (no rebuild)', () => {
    const { r, game } = setup({ theme: 'stone' });
    play(r, game, 7, 7);
    const first = r.svg.querySelector('.gboard__pcs [data-c]');
    play(r, game, 8, 8);
    expect(r.svg.querySelector('.gboard__pcs [data-c]')).toBe(first);
    expect(r.svg.querySelectorAll('.gboard__pcs [data-c]')).toHaveLength(2);
  });

  test('the overlay is kept and still last', () => {
    const { r, game } = setup({ theme: 'paper' });
    play(r, game, 7, 7);
    const ov = r.svg.querySelector('.gboard__ov');
    play(r, game, 3, 3);
    expect(r.svg.lastElementChild).toBe(ov);
  });

  describe('falls back to a full draw', () => {
    const cases = {
      'two stones at once (resync)': (r, game) => {
        game.board[1][1] = 1; game.board[2][2] = 2;
        game.hist.push({ x: 1, y: 1, color: 'BLACK' }, { x: 2, y: 2, color: 'WHITE' });
        r.setState({ board: game.board, moveHistory: game.hist, lastMove: { x: 2, y: 2 } });
      },
      'undo (stone removed)': (r, game) => {
        game.board[7][7] = 0; game.hist.pop();
        r.setState({ board: game.board, moveHistory: game.hist, lastMove: null });
      },
      'new board array (new game)': (r, game) => {
        game.board = empty(); game.hist = [];
        r.setState({ board: game.board, moveHistory: game.hist, lastMove: null });
      },
      'winning line appears': (r, game) => {
        game.board[3][3] = 2; game.hist.push({ x: 3, y: 3, color: 'WHITE' });
        r.setState({ board: game.board, moveHistory: game.hist, lastMove: { x: 3, y: 3 }, winLine: [{ x: 3, y: 3 }] });
      },
      'history did not grow (state-only setState)': (r) => { r.setState({ isMyTurn: false }); },
      'look changed between moves': (r, game) => {
        window.BoardPrefs.set({ theme: 'stone' });
        game.board[3][3] = 2; game.hist.push({ x: 3, y: 3, color: 'WHITE' });
        r.setState({ board: game.board, moveHistory: game.hist, lastMove: { x: 3, y: 3 } });
      },
    };
    test.each(Object.keys(cases))('%s', (name) => {
      const { r, game } = setup({ theme: 'paper' });
      play(r, game, 7, 7);
      const drawSpy = jest.spyOn(r, '_draw');
      cases[name](r, game);
      expect(drawSpy).toHaveBeenCalledTimes(1);
      const after = r.svg.innerHTML;
      expect(fullRedraw(r)).toBe(after);
    });
  });
});
