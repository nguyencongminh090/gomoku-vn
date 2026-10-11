/**
 * #217 — phone panel toggles between minimized (quick chat bar) and expanded; choice persists.
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/room.html?id=%23ABC"}
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
const BODY_HTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];

function loadRoom() {
  jest.resetModules();
  document.body.innerHTML = BODY_HTML;
  delete document.body.dataset.roomPanelToggleBound;
  delete document.body.dataset.roomTabsBound;
  window.GvnSession = { requireAuth: jest.fn(), getUser: jest.fn(() => ({ userId: 'u-1', displayName: 'T', isGuest: false })) };
  window.t = jest.fn((k) => k);
  window.requestAnimationFrame = jest.fn((cb) => cb());
  window.SocketClient = class { emit() {} on() {} bindStatusBanner() {} };
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  window.RoomState = { mySlot: null, roomData: { users: [] }, gameState: null };
  window.RoomClient = { emit: jest.fn() };
  require('../js/room.js');
}
const panel = () => document.querySelector('.rpanel');
const btn = () => document.getElementById('rpanel-toggle');

beforeEach(() => localStorage.clear());

test('default is minimized, toggle reports aria-expanded=false', () => {
  loadRoom();
  expect(panel().classList.contains('rpanel--min')).toBe(true);
  expect(btn().getAttribute('aria-expanded')).toBe('false');
  expect(btn().getAttribute('aria-label')).toBe('room.panel_expand');
});

test('click expands, click again minimizes, and the choice is stored', () => {
  loadRoom();
  btn().click();
  expect(panel().classList.contains('rpanel--min')).toBe(false);
  expect(btn().getAttribute('aria-expanded')).toBe('true');
  expect(btn().getAttribute('aria-label')).toBe('room.panel_collapse');
  expect(localStorage.getItem('gvn_room_panel_min')).toBe('0');
  btn().click();
  expect(panel().classList.contains('rpanel--min')).toBe(true);
  expect(localStorage.getItem('gvn_room_panel_min')).toBe('1');
});

test('a stored "expanded" choice is restored on load', () => {
  localStorage.setItem('gvn_room_panel_min', '0');
  loadRoom();
  expect(panel().classList.contains('rpanel--min')).toBe(false);
});

test('CSS: minimized shows only the input bar (tabs, other panes, message lines hidden), docked at the bottom; toggle is phone-only', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'room-arena.css'), 'utf8');
  // user 2026-10-11: "Chỉ để thanh input, không để khung chat (chat-messages)"
  expect(css).toMatch(/\.rpanel--min \.sidebar-tabs,\s*body\.arena-room \.rpanel--min \.tab-content:not\(#tab-chat\),\s*body\.arena-room \.rpanel--min \.chat-messages \{ display: none; \}/);
  expect(css).toMatch(/body\.arena-room \.rpanel--min \{ flex: none; min-height: 0; margin-top: auto; \}/);
  expect(css).toMatch(/body\.arena-room \.rpanel \{ order: 5; min-height: 200px;[^}]*margin-top: auto; \}/); // bottom stays put while animating
  const desktopHide = css.indexOf('body.arena-room .rpanel-toggle { display: none; }');
  const phoneShow = css.indexOf('body.arena-room .rpanel-toggle {\n    display: flex');
  expect(desktopHide).toBeGreaterThan(-1);
  expect(phoneShow).toBeGreaterThan(desktopHide); // later wins inside the ≤768px block
});

describe('min/expand animation (FLIP on the panel height)', () => {
  function withLayout(heights) {
    const anims = [];
    let i = 0;
    Element.prototype.animate = jest.fn(function (frames, opts) {
      const a = { el: this, frames, opts, cancel: jest.fn(), onfinish: null, oncancel: null };
      anims.push(a);
      return a;
    });
    jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      return this.classList && this.classList.contains('rpanel') ? { height: heights[i++ % heights.length] } : { height: 0 };
    });
    return anims;
  }
  afterEach(() => { delete Element.prototype.animate; jest.restoreAllMocks(); });

  test('expand animates flex-basis + min-height from the bar height to the panel height, and fades the content in', () => {
    loadRoom();
    const anims = withLayout([77, 360]);
    btn().click();
    const p = anims.find((a) => a.el === panel());
    expect(p.frames[0]).toMatchObject({ flexBasis: '77px', minHeight: '77px', flexGrow: 0 });
    expect(p.frames[1]).toMatchObject({ flexBasis: '360px', minHeight: '360px' });
    expect(p.opts.duration).toBeGreaterThan(0);
    expect(anims.some((a) => a.el.classList.contains('sidebar-tabs') && a.frames[0].opacity === 0)).toBe(true);
    expect(panel().classList.contains('rpanel--min')).toBe(false);
  });

  test('collapse keeps the expanded content (lines fade out) until the shrink ends, then minimizes', () => {
    localStorage.setItem('gvn_room_panel_min', '0');
    loadRoom();
    const anims = withLayout([360, 77]);
    btn().click();
    const p = anims.find((a) => a.el === panel());
    expect(p.frames[1]).toMatchObject({ flexBasis: '77px', minHeight: '77px' });
    expect(anims.some((a) => a.el.id === 'chat-messages' && a.frames[1].opacity === 0)).toBe(true);
    expect(panel().classList.contains('rpanel--min')).toBe(false); // still expanded mid-flight
    expect(panel().style.justifyContent).toBe('flex-end');          // input pinned to the bottom edge
    expect(btn().getAttribute('aria-expanded')).toBe('false');      // state is already the target
    p.onfinish();
    expect(panel().classList.contains('rpanel--min')).toBe(true);
    expect(panel().style.justifyContent).toBe('');
  });

  test('a click mid-collapse cancels it, lands its state, and expands again (reads aria-expanded, not the class)', () => {
    localStorage.setItem('gvn_room_panel_min', '0');
    loadRoom();
    const anims = withLayout([360, 77, 200, 77, 360]);
    btn().click();
    const first = anims.find((a) => a.el === panel());
    first.cancel.mockImplementation(() => first.oncancel());
    btn().click();
    expect(first.cancel).toHaveBeenCalled();
    expect(btn().getAttribute('aria-expanded')).toBe('true');
    expect(panel().classList.contains('rpanel--min')).toBe(false);
    const second = anims.filter((a) => a.el === panel())[1];
    expect(second.frames[0]).toMatchObject({ flexBasis: '200px' }); // starts from the mid-flight size
  });

  test('initial load and reduced motion never animate', () => {
    const anims = withLayout([77, 360]);
    loadRoom();
    expect(anims).toHaveLength(0);
    window.matchMedia = jest.fn((q) => ({ matches: q.includes('reduce'), addEventListener: jest.fn(), removeEventListener: jest.fn() }));
    btn().click();
    expect(anims).toHaveLength(0);
    expect(panel().classList.contains('rpanel--min')).toBe(false);
  });
});

describe('#218 keyboard: keep the chat field in view when the viewport shrinks', () => {
  function loadWithViewport() {
    const vv = new EventTarget();
    window.visualViewport = vv;
    delete document.body.dataset.roomKeyboardBound;
    loadRoom();
    const bar = document.getElementById('chat-input-wrapper');
    bar.scrollIntoView = jest.fn();
    return { vv, bar };
  }
  afterEach(() => { delete window.visualViewport; });

  test('resize while the chat field is focused scrolls the input bar into view (bottom edge)', () => {
    const { vv, bar } = loadWithViewport();
    document.getElementById('chat-input').focus();
    vv.dispatchEvent(new Event('resize'));
    expect(bar.scrollIntoView).toHaveBeenCalledWith({ block: 'end', inline: 'nearest' });
  });
  test('resize without focus (rotation, toolbar) does nothing', () => {
    const { vv, bar } = loadWithViewport();
    vv.dispatchEvent(new Event('resize'));
    expect(bar.scrollIntoView).not.toHaveBeenCalled();
  });
});
