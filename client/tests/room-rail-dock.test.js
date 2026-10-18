/**
 * Desktop rail is docked to the viewport's right edge and collapsible; the choice persists.
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
  document.body.className = 'arena-room';
  delete document.body.dataset.roomPanelToggleBound;
  delete document.body.dataset.roomRailDockBound;
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
const dock = () => document.getElementById('rail-dock-toggle');

beforeEach(() => localStorage.clear());

test('rail starts open; toggle collapses, re-expands, and persists', () => {
  loadRoom();
  expect(document.body.classList.contains('rail-collapsed')).toBe(false);
  expect(dock().getAttribute('aria-expanded')).toBe('true');
  dock().click();
  expect(document.body.classList.contains('rail-collapsed')).toBe(true);
  expect(dock().getAttribute('aria-expanded')).toBe('false');
  expect(dock().getAttribute('aria-label')).toBe('room.rail_expand');
  expect(localStorage.getItem('gvn_room_rail_collapsed')).toBe('1');
  dock().click();
  expect(document.body.classList.contains('rail-collapsed')).toBe(false);
});

test('stored collapsed state is restored on load', () => {
  localStorage.setItem('gvn_room_rail_collapsed', '1');
  loadRoom();
  expect(document.body.classList.contains('rail-collapsed')).toBe(true);
});

// B283: jsdom has no layout, so pin the CSS contract; visibility itself needs a real-browser pass.
test('collapsed rail keeps seatcards, controls and toasts while seated in a game (B283)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'room-arena.css'), 'utf8');
  const desktop = css.slice(css.indexOf('@media (min-width: 769px)'), css.indexOf('@media (prefers-reduced-motion'));
  const live = ':has(#game-controls:not(:empty))';
  expect(desktop).toMatch(new RegExp('rail-collapsed \\.rail' + live.replace(/[()#:]/g, '\\$&') + ' \\{[^}]*visibility: visible'));
  expect(desktop).toMatch(/\.rpanel > :not\(\.gtoasts\) \{ display: none/);
  expect(desktop).toMatch(/\.rail-collapsed:has\(#game-controls:not\(:empty\)\) \.room \{ padding-right/);
  // B287: toasts take flow space so they push the controls down instead of covering them
  expect(desktop).toMatch(/\.gtoasts \{ position: static/);
  expect(desktop).toMatch(/\.rpanel \{ flex: 0 0 auto; height: auto/);
  expect(document.getElementById('game-toasts').closest('.rpanel')).not.toBeNull();
});

// B284: tablet widths (769–1024px) default to collapsed so the board keeps focus; stored choice wins; default isn't persisted.
describe('tablet default (B284)', () => {
  function loadRoomWith(matches) {
    const real = jest.fn(() => ({ matches, addEventListener() {}, removeEventListener() {} }));
    jest.resetModules();
    document.body.innerHTML = BODY_HTML;
    document.body.className = 'arena-room';
    delete document.body.dataset.roomPanelToggleBound; delete document.body.dataset.roomRailDockBound; delete document.body.dataset.roomTabsBound;
    window.GvnSession = { requireAuth: jest.fn(), getUser: jest.fn(() => ({ userId: 'u-1', displayName: 'T', isGuest: false })) };
    window.t = jest.fn((k) => k);
    window.requestAnimationFrame = jest.fn((cb) => cb());
    window.SocketClient = class { emit() {} on() {} bindStatusBanner() {} };
    window.matchMedia = real;
    window.RoomState = { mySlot: null, roomData: { users: [] }, gameState: null };
    window.RoomClient = { emit: jest.fn() };
    require('../js/room.js');
  }
  test('no stored choice at tablet width → collapsed, not persisted', () => {
    loadRoomWith(true);
    expect(document.body.classList.contains('rail-collapsed')).toBe(true);
    expect(localStorage.getItem('gvn_room_rail_collapsed')).toBeNull();
  });
  test('stored "open" beats the tablet default', () => {
    localStorage.setItem('gvn_room_rail_collapsed', '0');
    loadRoomWith(true);
    expect(document.body.classList.contains('rail-collapsed')).toBe(false);
  });
  test('non-tablet width with no stored choice stays open', () => {
    loadRoomWith(false);
    expect(document.body.classList.contains('rail-collapsed')).toBe(false);
  });
});
