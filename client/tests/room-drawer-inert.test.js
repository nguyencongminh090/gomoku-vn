/**
 * TODO.md #138 / instruction.md §B138
 *
 * Collapsing the zen drawer only CLIPS its content: .panel-right-shell shrinks
 * to the rail width while .panel-right keeps its full width inside it, so
 * overflow:hidden cuts the content off and justify-content:flex-end leaves the
 * rail showing. That is deliberate (it avoids reflowing text on every drawer
 * animation) — but nothing in it removed the clipped content from the tab order
 * or the accessibility tree, so a keyboard user could Tab into an invisible
 * #chat-input and type there.
 *
 * The fix pairs the class with the `inert` DOM attribute on the content
 * columns, applied through the single `setDrawerCollapsed()` writer so all
 * three call sites that move the class stay in step. These tests hold down the
 * decision table (which class combination makes which element inert), the hard
 * constraint that the rail is NEVER inert, and the focus hand-off.
 *
 * Real Tab-order traversal is measured with Playwright instead — jsdom does not
 * implement `inert`'s effect on sequential focus navigation.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/room.html?id=%23ABC"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'room.html');
const BODY_HTML = (() => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!match) throw new Error('room.html: <body> tag not found');
  return match[1];
})();

function setupPage(bodyClass = 'zen-room') {
  document.body.innerHTML = BODY_HTML;
  document.body.className = bodyClass;
  delete document.body.dataset.roomTabsBound;

  window.GvnSession = {
    requireAuth: jest.fn(),
    getUser: jest.fn(() => ({ userId: 'u-1', displayName: 'Test User', isGuest: false })),
  };
  window.t = jest.fn((key) => key);
  window.requestAnimationFrame = jest.fn((cb) => cb());
  window.SocketClient = class {
    constructor() { this._handlers = {}; }
    emit() {}
    on() {}
    bindStatusBanner() {}
  };
  window.matchMedia = jest.fn(() => ({
    matches: false,
    media: '(max-width: 768px)',
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

function loadRoomModule() {
  jest.resetModules();
  require('../js/room.js');
  window.RoomState.boardRenderer = { resize: jest.fn() };
}

const contentRegions = () =>
  Array.from(document.querySelectorAll('.panel-right .panel-players, .panel-right .tab-content'));
const rail = () => document.querySelector('.sidebar-tabs');
const tabBtn = (id) => document.querySelector(`.tab-btn[data-tab="${id}"]`);

describe('zen drawer: collapsed content is inert (TODO.md #138)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setupPage();
    loadRoomModule();
  });
  afterEach(() => { jest.useRealTimers(); });

  describe('decision table: which class combination makes the content inert', () => {
    // `.zen-drawer-collapsed` has no matching CSS outside room-zen.css, so on a
    // non-zen skin the drawer is fully visible even when the class is present —
    // making its content inert there would hide content the user can see.
    test.each([
      ['zen-room, drawer open → not inert', 'zen-room', false, false],
      ['zen-room, drawer collapsed → inert', 'zen-room', true, true],
      ['non-zen skin, class absent → not inert', '', false, false],
      ['non-zen skin, class present → not inert', '', true, false],
    ])('%s', (_label, bodyClass, collapsed, expectedInert) => {
      setupPage(bodyClass);
      loadRoomModule();

      window.RoomDrawer.setCollapsed(collapsed);

      const regions = contentRegions();
      expect(regions.length).toBeGreaterThan(0);
      for (const region of regions) {
        expect(region.inert).toBe(expectedInert);
      }
    });
  });

  test('every content column is covered — players strip and all four tabs', () => {
    window.RoomDrawer.setCollapsed(true);

    const inertIds = contentRegions()
      .filter(r => r.inert)
      .map(r => r.id || r.className.split(' ')[0]);

    expect(inertIds).toEqual(expect.arrayContaining([
      'panel-players', 'tab-chat', 'tab-score', 'tab-users', 'tab-settings',
    ]));
  });

  test('the rail is NEVER inert — it is the only way to reopen the drawer', () => {
    for (const collapsed of [true, false, true]) {
      window.RoomDrawer.setCollapsed(collapsed);
      expect(rail().inert).toBeFalsy();
      for (const btn of document.querySelectorAll('.tab-btn')) {
        expect(btn.inert).toBeFalsy();
        expect(btn.closest('[inert]')).toBeNull();
      }
    }
  });

  test('reopening the drawer clears inert again', () => {
    window.RoomDrawer.setCollapsed(true);
    expect(contentRegions().every(r => r.inert)).toBe(true);

    window.RoomDrawer.setCollapsed(false);
    expect(contentRegions().some(r => r.inert)).toBe(false);
  });

  describe('all three writers of .zen-drawer-collapsed keep inert in step', () => {
    test('the tab click that toggles the drawer shut', () => {
      // tab-chat is the tab room.html loads with open, so the first click on it
      // is already the "re-click the active tab" gesture that collapses.
      const chat = tabBtn('tab-chat');
      expect(chat.classList.contains('tab-btn--active')).toBe(true);
      expect(contentRegions().some(r => r.inert)).toBe(false);

      chat.click();                       // re-click = collapse
      expect(document.body.classList.contains('zen-drawer-collapsed')).toBe(true);
      expect(contentRegions().every(r => r.inert)).toBe(true);

      chat.click();                       // re-click again = reopen
      expect(document.body.classList.contains('zen-drawer-collapsed')).toBe(false);
      expect(contentRegions().some(r => r.inert)).toBe(false);
    });

    test('switching to a different tab reopens and clears inert', () => {
      window.RoomDrawer.setCollapsed(true);

      tabBtn('tab-score').click();

      expect(document.body.classList.contains('zen-drawer-collapsed')).toBe(false);
      expect(contentRegions().some(r => r.inert)).toBe(false);
    });

    test('the breakpoint handler that un-sticks a collapsed drawer (TODO.md #134)', () => {
      // room.js registers this listener on the matchMedia object it created.
      const mql = window.matchMedia.mock.results[0].value;
      const onChange = mql.addEventListener.mock.calls.find(c => c[0] === 'change')[1];

      window.RoomDrawer.setCollapsed(true);
      expect(contentRegions().every(r => r.inert)).toBe(true);

      onChange({ matches: false });       // viewport is provably wide again

      expect(document.body.classList.contains('zen-drawer-collapsed')).toBe(false);
      expect(contentRegions().some(r => r.inert)).toBe(false);
    });

    test('room-socket.js\'s mobile auto-collapse goes through RoomDrawer', () => {
      // Not a behavioural test of room-socket.js (it needs a live socket) — it
      // asserts the call site was rewritten, since a raw classList.add() there
      // would silently reintroduce the bug on phones only.
      const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'room-socket.js'), 'utf8');
      expect(src).toContain('RoomDrawer.setCollapsed(true)');
      expect(src).not.toMatch(/classList\.add\(\s*['"]zen-drawer-collapsed['"]\s*\)/);
    });
  });

  describe('focus hand-off', () => {
    test('focus inside the drawer moves to the active rail button before inert lands', () => {
      const chatInput = document.getElementById('chat-input');
      chatInput.focus();
      expect(document.activeElement).toBe(chatInput);

      window.RoomDrawer.setCollapsed(true);

      // Not <body>: a keyboard user must keep a position in the page, and the
      // rail button is the control that reopens what they were just in.
      expect(document.activeElement).toBe(tabBtn('tab-chat'));
      expect(document.activeElement.closest('[inert]')).toBeNull();
    });

    test('focus outside the drawer is left alone', () => {
      const leave = document.getElementById('btn-leave');
      leave.focus();

      window.RoomDrawer.setCollapsed(true);

      expect(document.activeElement).toBe(leave);
    });

    test('the hand-off targets the rail button of the tab actually open', () => {
      tabBtn('tab-settings').click();     // makes tab-settings the active tab
      // settings-panel.js renders this tab's controls at runtime; stand one in,
      // since an empty div is not focusable and the point here is which rail
      // button the hand-off picks.
      const control = document.createElement('button');
      document.getElementById('settings-body').appendChild(control);
      control.focus();
      expect(document.activeElement).toBe(control);

      window.RoomDrawer.setCollapsed(true);

      expect(document.activeElement).toBe(tabBtn('tab-settings'));
      expect(document.activeElement).not.toBe(tabBtn('tab-chat'));
    });
  });
});
