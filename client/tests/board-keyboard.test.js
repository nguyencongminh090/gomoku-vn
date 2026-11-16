/**
 * TODO.md #326 — the board is one tab stop; arrows move a cursor, Enter/Space selects
 * through the same path as a click.
 *
 * @jest-environment jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'board.js'), 'utf8');

function make(opts = {}) {
  delete window.BoardRenderer;
  delete window.BoardPrefs;
  localStorage.clear();
  window.eval(SRC);
  document.body.innerHTML = '<div id="wrap"><svg id="board"></svg></div>';
  const onCellClick = jest.fn();
  const r = new window.BoardRenderer(document.getElementById('board'), { boardSize: 15, onCellClick, clickMode: 'single', ...opts });
  r.setState({ board: Array.from({ length: 15 }, () => Array(15).fill(0)), interactive: true, isMyTurn: true });
  return { r, onCellClick };
}
const key = (r, k) => r.svg.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

test('board is a focusable application, not an image; not a tab stop when not interactive', () => {
  const { r } = make();
  expect(r.svg.getAttribute('tabindex')).toBe('0');
  expect(r.svg.getAttribute('role')).toBe('application');
  r.setState({ interactive: false });
  expect(r.svg.hasAttribute('tabindex')).toBe(false);
});

test('cursor is drawn on occupied cells too', () => {
  const { r } = make();
  r.board[7][7] = 1;
  key(r, 'ArrowRight');
  expect(r.svg.querySelector('.gboard__kbcursor')).not.toBeNull();
});

test('pointer movement takes over from the keyboard cursor', () => {
  const { r, onCellClick } = make();
  key(r, 'ArrowRight'); key(r, 'ArrowLeft');
  r.svg.dispatchEvent(new Event('pointerleave'));
  expect(r._kbCell).toBeNull();
  key(r, 'Enter');
  expect(onCellClick).not.toHaveBeenCalled();
});

test('Escape clears the cursor', () => {
  const { r } = make();
  key(r, 'ArrowRight'); key(r, 'Escape');
  expect(r._kbCell).toBeNull();
  expect(r.svg.querySelector('.gboard__kbcursor')).toBeNull();
});

test('destroy removes the live region', () => {
  const { r } = make();
  key(r, 'ArrowRight');
  r.destroy();
  expect(document.querySelector('[role=status]')).toBeNull();
});

test('arrows move the cursor from the centre, Enter emits the same as a click', () => {
  const { r, onCellClick } = make();
  key(r, 'ArrowRight'); // first key lands on the centre
  expect(r._kbCell).toEqual({ x: 7, y: 7 });
  key(r, 'ArrowRight');
  key(r, 'ArrowDown');
  key(r, 'Enter');
  expect(onCellClick).toHaveBeenCalledWith(8, 8);
  expect(r._live.textContent).toBe('I7');
});

test('cursor is clamped at the edges', () => {
  const { r } = make();
  key(r, 'ArrowUp');
  for (let i = 0; i < 20; i++) { key(r, 'ArrowUp'); key(r, 'ArrowLeft'); }
  expect(r._kbCell).toEqual({ x: 0, y: 0 });
});

test('occupied cell and not-my-turn do not emit; double mode needs a second Enter', () => {
  const { r, onCellClick } = make();
  r.setState({ board: Object.assign(r.board.map((row) => row.slice()), {}) });
  r.board[7][7] = 1;
  key(r, 'ArrowRight'); key(r, 'Enter');
  expect(onCellClick).not.toHaveBeenCalled();
  r.setState({ isMyTurn: false });
  key(r, 'ArrowRight'); key(r, ' ');
  expect(onCellClick).not.toHaveBeenCalled();

  const d = make({ clickMode: 'double' });
  key(d.r, 'ArrowRight'); key(d.r, 'Enter');
  expect(d.onCellClick).not.toHaveBeenCalled();
  key(d.r, 'Enter');
  expect(d.onCellClick).toHaveBeenCalledWith(7, 7);
});

test('blur clears the cursor', () => {
  const { r } = make();
  key(r, 'ArrowRight');
  r.svg.dispatchEvent(new Event('blur'));
  expect(r._kbCell).toBeNull();
  expect(r._hoverCell).toBeNull();
});
