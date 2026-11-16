/**
 * #400 — pinch-zoom the board only (viewBox), pan with one finger, double-tap resets.
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'board.js'), 'utf8');

function make() {
  document.body.innerHTML = '<canvas id="board"></canvas>';
  delete window.BoardRenderer;
  window.eval(SRC);
  const clicks = [];
  const r = new window.BoardRenderer(document.getElementById('board'), { boardSize: 15, clickMode: 'single', onCellClick: (x, y) => clicks.push([x, y]) });
  r.svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400 });
  r.board = Array.from({ length: 15 }, () => Array(15).fill(0));
  r._draw();
  r.interactive = true; r.isMyTurn = true;
  return { r, clicks };
}
const ptr = (r, type, id, x, y) => r._handlers[type]({ pointerType: 'touch', pointerId: id, clientX: x, clientY: y });
const vb = (r) => r.svg.getAttribute('viewBox').split(' ').map(Number);
const touchEnd = (r, x, y, left = 0) => r._onTouchEnd({ preventDefault() {}, changedTouches: [{ clientX: x, clientY: y }], touches: Array(left).fill({}) });

describe('board pinch zoom (#400)', () => {
  test('spreading two fingers zooms in (smaller viewBox), clamped to MAX', () => {
    const { r } = make();
    const full = vb(r);
    ptr(r, 'pointerdown', 1, 150, 200); ptr(r, 'pointerdown', 2, 250, 200);
    ptr(r, 'pointermove', 1, 100, 200); ptr(r, 'pointermove', 2, 300, 200); // 2x
    expect(vb(r)[2]).toBeCloseTo(full[2] / 2, 5);
    ptr(r, 'pointermove', 1, -2000, 200); ptr(r, 'pointermove', 2, 2400, 200);
    expect(vb(r)[2]).toBeCloseTo(full[2] / 4, 5);
  });

  test('pinching back to ~1x snaps to the full board', () => {
    const { r } = make();
    const full = vb(r);
    ptr(r, 'pointerdown', 1, 150, 200); ptr(r, 'pointerdown', 2, 250, 200);
    ptr(r, 'pointermove', 1, 100, 200); ptr(r, 'pointermove', 2, 300, 200);
    ptr(r, 'pointermove', 1, 150, 200); ptr(r, 'pointermove', 2, 250, 200);
    expect(vb(r)).toEqual(full);
  });

  test('cell hit-testing follows the zoomed view', () => {
    const { r } = make();
    const before = r._cellFromClient(200, 200);
    ptr(r, 'pointerdown', 1, 150, 200); ptr(r, 'pointerdown', 2, 250, 200);
    ptr(r, 'pointermove', 1, 100, 200); ptr(r, 'pointermove', 2, 300, 200); // anchored at centre
    expect(r._cellFromClient(200, 200)).toEqual(before);
    expect(r._cellFromClient(0, 200).x).toBeGreaterThan(before.x - 5); // edge now shows cells near centre
    expect(r._cellFromClient(0, 200).x).not.toBe(0);
  });

  test('the touchend of a pinch places no stone; the next plain tap does', () => {
    const { r, clicks } = make();
    ptr(r, 'pointerdown', 1, 150, 200); ptr(r, 'pointerdown', 2, 250, 200);
    ptr(r, 'pointermove', 1, 100, 200); ptr(r, 'pointermove', 2, 300, 200);
    ptr(r, 'pointerup', 1, 100, 200); touchEnd(r, 100, 200, 1);
    ptr(r, 'pointerup', 2, 300, 200); touchEnd(r, 300, 200, 0);
    expect(clicks).toEqual([]);
    ptr(r, 'pointerdown', 3, 200, 200); ptr(r, 'pointerup', 3, 200, 200); touchEnd(r, 200, 200, 0);
    expect(clicks.length).toBe(1);
  });

  test('one-finger drag pans a zoomed board and places no stone; no pan at 1x', () => {
    const { r, clicks } = make();
    ptr(r, 'pointerdown', 1, 200, 200); ptr(r, 'pointermove', 1, 100, 200);
    expect(vb(r)[0]).toBe(0); // not zoomed → no pan
    ptr(r, 'pointerup', 1, 100, 200); r._gesture = false;
    ptr(r, 'pointerdown', 1, 150, 200); ptr(r, 'pointerdown', 2, 250, 200);
    ptr(r, 'pointermove', 1, 100, 200); ptr(r, 'pointermove', 2, 300, 200);
    ptr(r, 'pointerup', 1, 0, 0); touchEnd(r, 0, 0, 1); ptr(r, 'pointerup', 2, 0, 0); touchEnd(r, 0, 0, 0);
    const x0 = vb(r)[0];
    ptr(r, 'pointerdown', 5, 300, 200); ptr(r, 'pointermove', 5, 200, 200);
    expect(vb(r)[0]).toBeGreaterThan(x0);
    ptr(r, 'pointerup', 5, 200, 200); touchEnd(r, 200, 200, 0);
    expect(clicks).toEqual([]);
  });

  test('double-tap on a non-actionable spot resets zoom; on an empty cell it is a normal tap', () => {
    const { r, clicks } = make();
    r.interactive = false; // spectator: taps never act
    ptr(r, 'pointerdown', 1, 150, 200); ptr(r, 'pointerdown', 2, 250, 200);
    ptr(r, 'pointermove', 1, 100, 200); ptr(r, 'pointermove', 2, 300, 200);
    ptr(r, 'pointerup', 1, 0, 0); touchEnd(r, 0, 0, 1); ptr(r, 'pointerup', 2, 0, 0); touchEnd(r, 0, 0, 0);
    expect(r._zoom).toBeGreaterThan(1);
    touchEnd(r, 200, 200); touchEnd(r, 201, 201);
    expect(r._zoom).toBe(1);
    expect(vb(r)).toEqual([r.geo.vx, r.geo.vy, r.geo.VW, r.geo.VH]);
    expect(clicks).toEqual([]);
  });
});
