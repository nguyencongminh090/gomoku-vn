/**
 * Viewer peek: a spectator may hover / click / tap the board. It only draws a local
 * highlight (overlay) — onCellClick never fires, so no move is ever sent.
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'board.js'), 'utf8');

// 15x15 board in a 400px box: cell (7,7) sits at the centre.
function make(state = { interactive: false, peek: true }) {
  document.body.innerHTML = '<div><svg id="board"></svg></div>';
  delete window.BoardRenderer;
  window.eval(SRC);
  const onCellClick = jest.fn();
  const r = new window.BoardRenderer(document.getElementById('board'), { boardSize: 15, clickMode: 'single', onCellClick });
  r.svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400 });
  r.setState({ board: Array.from({ length: 15 }, () => Array(15).fill(0)), ...state });
  if (!r.geo) r._draw();
  return { r, onCellClick };
}
const click = (r, x = 200, y = 200) => r._handlers.click({ clientX: x, clientY: y });
const tap = (r, x = 200, y = 200) => r._handlers.touchend({ touches: [], changedTouches: [{ clientX: x, clientY: y }], cancelable: true, preventDefault() {} });
const hover = (r, x = 200, y = 200) => r._handlers.pointermove({ pointerType: 'mouse', pointerId: 1, clientX: x, clientY: y });
const mark = (r) => r.svg.querySelector('.gboard__mark');

test('viewer click highlights a cell and sends nothing', () => {
  const { r, onCellClick } = make();
  click(r);
  expect(r._markCell).toEqual({ x: 7, y: 7 });
  expect(mark(r)).not.toBeNull();
  expect(onCellClick).not.toHaveBeenCalled();
});

test('clicking the same cell again clears it; another cell moves it', () => {
  const { r } = make();
  click(r); click(r);
  expect(mark(r)).toBeNull();
  click(r); click(r, 240, 200);
  expect(r._markCell).toEqual({ x: 9, y: 7 });
  click(r, 1, 1); // the margin is no cell: the mark stays
  expect(r._markCell).toEqual({ x: 9, y: 7 });
});

test('viewer tap highlights too, also on an occupied cell', () => {
  const { r, onCellClick } = make();
  r.board[7][7] = 1;
  tap(r);
  expect(mark(r)).not.toBeNull();
  expect(onCellClick).not.toHaveBeenCalled();
});

test('viewer hover shows the hover ghost even though it is not their turn', () => {
  const { r } = make();
  hover(r);
  expect(r._hoverCell).toEqual({ x: 7, y: 7 });
});

test('without peek a non-interactive board stays inert', () => {
  const { r } = make({ interactive: false });
  click(r); tap(r); hover(r);
  expect(r._markCell).toBeNull();
  expect(r._hoverCell).toBeNull();
});

test('a player (interactive) never gets the viewer mark; the click still plays', () => {
  const { r, onCellClick } = make({ interactive: true, isMyTurn: true, peek: true });
  click(r);
  expect(r._markCell).toBeNull();
  expect(onCellClick).toHaveBeenCalledWith(7, 7);
});

test('the mark clears when the viewer sits down (peek off / interactive on)', () => {
  const { r } = make();
  click(r);
  r.setState({ interactive: true, peek: false });
  expect(r._markCell).toBeNull();
});

test('the mark survives a move redraw', () => {
  const { r } = make();
  click(r);
  const b = r.board.map((row) => row.slice()); b[3][3] = 1;
  r.setState({ board: b, lastMove: { x: 3, y: 3 } });
  expect(mark(r)).not.toBeNull();
});
