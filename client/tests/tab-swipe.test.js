/**
 * #421 — phone: swipe left/right anywhere on a tab-bar page moves to the next/previous tab.
 *
 * @jest-environment jsdom
 */

'use strict';

let clicked;
let now;

function boot(active, { user = null, extra = '' } = {}) {
  jest.resetModules();
  document.body.innerHTML = '<div id="pl-shell"></div><main>' + extra + '</main>';
  window.t = (k) => k;
  window.GvnSession = { getUser: () => user };
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
  // jsdom has no layout: report the tab bar as shown (phone) unless a test hides it.
  Element.prototype.getClientRects = function () {
    if (this.hasAttribute('data-gone')) return []; // stands for "display:none by CSS"
    return this.classList.contains('ptabbar') && window.__barHidden ? [] : [{}];
  };
  require('../js/platform-shell.js');
  window.PlatformShell.build(active);
  clicked = [];
  document.querySelectorAll('.ptabbar a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); clicked.push(a.dataset.tab); }));
}

/** jsdom keeps `style.translate` as a plain expando (no CSS property support). */
const tr = (n) => n.style.translate || '';

function touch(type, target, x, y) {
  const ev = new Event(type, { bubbles: true, cancelable: type === 'touchmove' });
  const p = { clientX: x, clientY: y };
  Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [p] });
  Object.defineProperty(ev, 'changedTouches', { value: [p] });
  target.dispatchEvent(ev);
  return ev;
}

/** Finger from (x0,y) to (x1,y+dy) in 10 steps over ms; returns the last touchmove event.
 *  opts.end = false leaves the finger down (to inspect the drag). */
function swipe(target, x0, x1, { dy = 0, ms = 200, y = 300, end = true } = {}) {
  touch('touchstart', target, x0, y);
  let last;
  for (let i = 1; i <= 10; i++) {
    now += ms / 10;
    last = touch('touchmove', target, x0 + (x1 - x0) * i / 10, y + dy * i / 10);
  }
  if (end) touch('touchend', target, x1, y + dy);
  return last;
}

beforeEach(() => {
  now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  window.__barHidden = false;
  window.innerWidth = 390;
  sessionStorage.clear();
});
afterEach(() => { jest.restoreAllMocks(); delete window.matchMedia; });

describe('#421 tab swipe', () => {
  it('swipe left = next tab, swipe right = previous tab', () => {
    boot('rankings');
    const main = document.querySelector('main');
    swipe(main, 300, 150);
    swipe(main, 100, 250);
    expect(clicked).toEqual(['tournaments', 'rooms']);
  });

  it('no wrap at either end', () => {
    boot('lobby');
    swipe(document.querySelector('main'), 100, 250); // previous of the first tab
    expect(clicked).toEqual([]);
  });

  it.each([
    ['short and slow (< 30 % width, no flick)', { x0: 200, x1: 150, ms: 600 }],
    ['mostly vertical (a scroll)', { x0: 300, x1: 200, dy: 160 }],
    ['starts on the left OS back-gesture edge', { x0: 10, x1: 200 }],
    ['starts on the right edge', { x0: 380, x1: 200 }],
  ])('ignored: %s', (_, g) => {
    boot('rankings');
    swipe(document.querySelector('main'), g.x0, g.x1, { dy: g.dy || 0, ms: g.ms || 200 });
    expect(clicked).toEqual([]);
  });

  it('a slow drag past 30 % of the width commits (no time limit)', () => {
    boot('rankings');
    swipe(document.querySelector('main'), 300, 160, { ms: 3000 }); // 140 px of 390, 0.05 px/ms
    expect(clicked).toEqual(['tournaments']);
  });

  it('the page follows the finger while dragging, and the gesture blocks page scroll', () => {
    boot('rankings', { extra: '<section id="a">a</section><section hidden>b</section>' });
    const ev = swipe(document.querySelector('main'), 300, 220, { end: false });
    expect(tr(document.getElementById('a'))).toBe('-80px 0');
    expect(tr(document.querySelector('section[hidden]'))).toBe('');
    expect(ev.defaultPrevented).toBe(true);
    touch('touchend', document.querySelector('main'), 220, 300); // 80 px slow-ish → springs back
    expect(clicked).toEqual([]);
    expect(tr(document.getElementById('a'))).toBe('');
  });

  it('no tab that way: the drag rubber-bands at a quarter of the finger and springs back', () => {
    boot('lobby', { extra: '<section id="a">a</section>' });
    swipe(document.querySelector('main'), 100, 300, { end: false });
    expect(tr(document.getElementById('a'))).toBe('50px 0');
    touch('touchend', document.querySelector('main'), 300, 300);
    expect(clicked).toEqual([]);
    expect(tr(document.getElementById('a'))).toBe('');
  });

  it('a vertical scroll is never blocked', () => {
    boot('rankings');
    const ev = swipe(document.querySelector('main'), 200, 205, { dy: 200, end: false });
    expect(ev.defaultPrevented).toBe(false);
  });

  it('reduced motion: the page does not follow, the swipe still navigates', () => {
    window.matchMedia = (q) => ({ matches: /reduce/.test(q) });
    boot('rankings', { extra: '<section id="a">a</section>' });
    swipe(document.querySelector('main'), 300, 100, { end: false });
    expect(tr(document.getElementById('a'))).toBe('');
    touch('touchend', document.querySelector('main'), 100, 300);
    expect(clicked).toEqual(['tournaments']);
  });

  it('a short fast flick (≥ 40 px at ≥ 0.5 px/ms) counts', () => {
    boot('rankings');
    swipe(document.querySelector('main'), 250, 200, { ms: 80 }); // 50 px at 0.6 px/ms
    expect(clicked).toEqual(['tournaments']);
  });

  it.each([
    ['an input', '<input id="x">'],
    ['the board', '<div class="gboard"><span id="x"></span></div>'],
    ['a dialog', '<div role="dialog"><p id="x"></p></div>'],
    ['an opt-out', '<div data-no-swipe><p id="x"></p></div>'],
  ])('ignored when it starts on %s', (_, html) => {
    boot('rankings', { extra: html });
    swipe(document.getElementById('x'), 300, 100);
    expect(clicked).toEqual([]);
  });

  it('a modal hidden by CSS (lobby keeps them in the DOM) does not block; a shown one does', () => {
    boot('lobby', { extra: '<div role="dialog" aria-modal="true" data-gone></div><p id="x">a</p>' });
    swipe(document.getElementById('x'), 300, 100);
    expect(clicked).toEqual(['rooms']);
    document.querySelector('[aria-modal]').removeAttribute('data-gone');
    swipe(document.getElementById('x'), 300, 100);
    expect(clicked).toEqual(['rooms']);
  });

  it('ignored inside a horizontal scroller (live strip, bracket, table)', () => {
    boot('rankings', { extra: '<ul id="strip" style="overflow-x:auto"><li id="x">a</li></ul>' });
    const strip = document.getElementById('strip');
    Object.defineProperty(strip, 'scrollWidth', { value: 800 });
    Object.defineProperty(strip, 'clientWidth', { value: 390 });
    swipe(document.getElementById('x'), 300, 100);
    expect(clicked).toEqual([]);
  });

  it('ignored on pages that are not a tab (clubs) and on desktop (tab bar hidden)', () => {
    boot('clubs');
    swipe(document.querySelector('main'), 300, 100);
    expect(clicked).toEqual([]);
    window.__barHidden = true;
    boot('rankings');
    swipe(document.querySelector('main'), 300, 100);
    expect(clicked).toEqual([]);
  });

  it('never goes to Tôi before its profile link is known (href "#")', () => {
    boot('tournaments', { user: { userId: 'u', isGuest: false, displayName: 'Z' } });
    swipe(document.querySelector('main'), 300, 100);
    expect(clicked).toEqual([]);
  });

  it('cross-page swipe leaves the direction for the arrival slide; it is consumed once', () => {
    boot('rankings');
    swipe(document.querySelector('main'), 300, 100);
    expect(JSON.parse(sessionStorage.getItem('pswipe'))).toMatchObject({ dir: 1 });
    const anim = jest.fn(() => ({}));
    HTMLElement.prototype.animate = anim;
    window.matchMedia = () => ({ matches: false });
    boot('tournaments', { extra: '<section>a</section><section hidden>b</section>' });
    expect(sessionStorage.getItem('pswipe')).toBeNull();
    expect(anim).toHaveBeenCalledTimes(1); // the hidden child is skipped
    expect(anim.mock.calls[0][0][0].translate).toBe(390 * 0.3 + 'px 0'); // from --pswipe-in of the width
    delete HTMLElement.prototype.animate;
  });

  it('reduced motion: navigates, but no slide', () => {
    const anim = jest.fn(() => ({}));
    HTMLElement.prototype.animate = anim;
    window.matchMedia = (q) => ({ matches: /reduce/.test(q) });
    sessionStorage.setItem('pswipe', JSON.stringify({ dir: -1, at: now }));
    boot('rooms', { extra: '<section>a</section>' });
    expect(anim).not.toHaveBeenCalled();
    delete HTMLElement.prototype.animate;
  });
});
