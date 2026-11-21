/**
 * Renju (#425): the board draws a no-entry sign on each cell Black may not play, only on empty cells, and drops them
 * when the list is cleared. The cells come from Renju.forbiddenPoints (game-ui); here the renderer + the
 * shared detector are exercised together on a real double-three.
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'board.js'), 'utf8');
const Renju = require('../js/renju');

function make() {
  document.body.innerHTML = '<div><svg id="board"></svg></div>';
  delete window.BoardRenderer;
  window.eval(SRC);
  const r = new window.BoardRenderer(document.getElementById('board'), { boardSize: 15, clickMode: 'single' });
  r.svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400 });
  const board = Array.from({ length: 15 }, () => Array(15).fill(0));
  for (const [x, y] of [[5, 7], [6, 7], [7, 5], [7, 6]]) board[y][x] = 1;
  r.setState({ board, interactive: true });
  if (!r.geo) r._draw();
  return { r, board };
}
const marks = (r) => r.svg.querySelectorAll('.gboard__forbidden path');

test('forbidden cells get a sign, nothing otherwise', () => {
  const { r, board } = make();
  expect(marks(r)).toHaveLength(0);
  const pts = Renju.forbiddenPoints(board.map((row) => row.slice()));
  expect(pts.some((p) => p.x === 7 && p.y === 7)).toBe(true);
  r.setState({ forbidden: pts.map(({ x, y }) => ({ x, y })) });
  expect(marks(r)).toHaveLength(pts.length);
});

test('clearing the list removes the marks (opponent turn / game over)', () => {
  const { r, board } = make();
  r.setState({ forbidden: [{ x: 7, y: 7 }] });
  expect(marks(r)).toHaveLength(1);
  r.setState({ forbidden: [] });
  expect(marks(r)).toHaveLength(0);
  void board;
});

test('an occupied cell never shows a sign', () => {
  const { r } = make();
  r.setState({ forbidden: [{ x: 5, y: 7 }] }); // a Black stone is there
  expect(marks(r)).toHaveLength(0);
});
