/**
 * Board lets the page scroll: one finger dragged on a full-size board scrolls the page
 * (touch-action pan-x pan-y, no tap placed); pinch and zoomed pan stay the board's.
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
const pts = (list) => list.map(([x, y]) => ({ clientX: x, clientY: y }));
const tev = (list, extra = {}) => ({ touches: pts(list), cancelable: true, preventDefault: jest.fn(), ...extra });
const ptr = (r, type, id, x, y) => r._handlers[type]({ pointerType: 'touch', pointerId: id, clientX: x, clientY: y });
const end = (r, x, y, cancelable = true) => {
  const e = { touches: [], changedTouches: pts([[x, y]]), cancelable, preventDefault: jest.fn() };
  r._handlers.touchend(e); return e;
};

describe('board touch lets the page scroll', () => {
  test('full-size board allows one-finger page pan (pan-x pan-y)', () => {
    const { r } = make();
    expect(r.svg.style.touchAction).toBe('pan-x pan-y');
  });

  test('one-finger drag at zoom 1 is not cancelled and places no stone', () => {
    const { r, clicks } = make();
    r._handlers.touchstart(tev([[200, 200]]));
    const mv = tev([[200, 260]]);
    r._handlers.touchmove(mv);
    expect(mv.preventDefault).not.toHaveBeenCalled();
    const e = end(r, 200, 260, false); // browser scrolled: touchend non-cancelable
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(clicks).toEqual([]);
  });

  test('browser pointercancel (scroll took over) also means no stone', () => {
    const { r, clicks } = make();
    r._handlers.touchstart(tev([[200, 200]]));
    ptr(r, 'pointerdown', 1, 200, 200); ptr(r, 'pointercancel', 1, 200, 205);
    end(r, 200, 205);
    expect(clicks).toEqual([]);
  });

  test('a small jitter (<10px) is still a tap, and the next tap after a scroll works', () => {
    const { r, clicks } = make();
    r._handlers.touchstart(tev([[200, 200]]));
    r._handlers.touchmove(tev([[200, 260]]));
    end(r, 200, 260, false);
    r._handlers.touchstart(tev([[200, 200]]));
    r._handlers.touchmove(tev([[204, 203]]));
    const e = end(r, 204, 203);
    expect(e.preventDefault).toHaveBeenCalledTimes(1); // #104 still holds for taps
    expect(clicks.length).toBe(1);
  });

  test('two-finger move is cancelled (pinch stays on the board, page does not scroll)', () => {
    const { r } = make();
    const mv = tev([[150, 200], [250, 200]]);
    r._handlers.touchmove(mv);
    expect(mv.preventDefault).toHaveBeenCalled();
  });

  test('zoomed board: touch-action none and one-finger moves are cancelled; reset restores pan', () => {
    const { r } = make();
    ptr(r, 'pointerdown', 1, 150, 200); ptr(r, 'pointerdown', 2, 250, 200);
    ptr(r, 'pointermove', 1, 100, 200); ptr(r, 'pointermove', 2, 300, 200);
    expect(r.svg.style.touchAction).toBe('none');
    const mv = tev([[200, 260]]);
    r._handlers.touchmove(mv);
    expect(mv.preventDefault).toHaveBeenCalled();
    r.resetZoom();
    expect(r.svg.style.touchAction).toBe('pan-x pan-y');
  });
});
