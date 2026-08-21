/**
 * TODO.md #136 / docs/fix-log/*-todo-136-tab-activation-vs-drawer-toggle.md
 *
 * The zen drawer's collapsed state used to be reachable by two accidents,
 * both of which look to the user exactly like the reported symptom — the
 * sidebar "thụt vào trong" on a wide desktop viewport, with no one having
 * asked for it:
 *
 *  1. room-ui.js bounced the user off a tab whose button had just been hidden
 *     by synthesising `chatBtn.click()`. That fake event re-entered room.js's
 *     click handler, which owns the drawer toggle, and decided what to do from
 *     `alreadyActive` — DOM state, not the caller's intent.
 *  2. A stale `?v=` on any cross-import makes the browser resolve a SECOND
 *     module instance of room.js and re-run its top level (the hazard
 *     CLAUDE.md's cache-busting rule documents; it has shipped twice as a
 *     duplicate socket). Two copies of the listener turn an ordinary "switch
 *     to another tab" click into a collapse: copy #1 removes the class and
 *     marks the button active, then copy #2 sees `alreadyActive === true` and
 *     toggles the drawer shut.
 *
 * The fix splits activation (`window.RoomTabs.activate`, never touches the
 * drawer) from the click handler (which alone owns the toggle), and guards the
 * binding so the listener exists once per document however many times the
 * module is evaluated. These tests hold both halves down, plus the two real
 * user gestures that must keep working.
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

function setupPage() {
  document.body.innerHTML = BODY_HTML;
  document.body.className = 'zen-room';
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

/** Evaluate room.js's top level. Call twice to simulate the ?v= hazard. */
function loadRoomModule() {
  jest.resetModules();
  require('../js/room.js');
  window.RoomState.boardRenderer = { resize: jest.fn() };
}

const tabBtn = (id) => document.querySelector(`.tab-btn[data-tab="${id}"]`);
const collapsed = () => document.body.classList.contains('zen-drawer-collapsed');
const activeTab = () => document.querySelector('.tab-btn--active')?.getAttribute('data-tab');

describe('room.js tab activation vs. drawer toggle (TODO.md #136)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    setupPage();
  });
  afterEach(() => { jest.useRealTimers(); });

  describe('programmatic activation never moves the drawer', () => {
    test.each([
      ['drawer open', false],
      ['drawer collapsed', true],
    ])('RoomTabs.activate leaves the drawer as it found it (%s)', (_label, startCollapsed) => {
      loadRoomModule();
      tabBtn('tab-users').click();               // a real user opens Khán giả
      document.body.classList.toggle('zen-drawer-collapsed', startCollapsed);

      window.RoomTabs.activate('tab-chat');      // room-ui.js's bounce

      expect(activeTab()).toBe('tab-chat');
      expect(document.getElementById('tab-chat').classList.contains('tab-content--active')).toBe(true);
      expect(collapsed()).toBe(startCollapsed);  // ← the whole point
    });

    test('activating the tab that is already active is still inert', () => {
      loadRoomModule();
      document.body.classList.add('zen-drawer-collapsed');

      window.RoomTabs.activate('tab-chat');
      window.RoomTabs.activate('tab-chat');

      expect(collapsed()).toBe(true);
      expect(activeTab()).toBe('tab-chat');
    });

    test('activating an unknown tab id is a no-op, not a crash', () => {
      loadRoomModule();
      tabBtn('tab-users').click();

      expect(() => window.RoomTabs.activate('tab-nope')).not.toThrow();
      expect(activeTab()).toBe('tab-users');
    });
  });

  describe('real user gestures still behave', () => {
    test('clicking a different tab opens the drawer', () => {
      loadRoomModule();
      document.body.classList.add('zen-drawer-collapsed');

      tabBtn('tab-users').click();

      expect(activeTab()).toBe('tab-users');
      expect(collapsed()).toBe(false);
    });

    test('re-clicking the active tab toggles the drawer both ways', () => {
      loadRoomModule();

      tabBtn('tab-chat').click();   // chat is already active in the markup
      expect(collapsed()).toBe(true);

      tabBtn('tab-chat').click();
      expect(collapsed()).toBe(false);
    });

    test('a drawer-moving click re-fits the board, an ordinary activation does not', () => {
      loadRoomModule();
      const { resize } = window.RoomState.boardRenderer;

      window.RoomTabs.activate('tab-users');
      expect(resize).not.toHaveBeenCalled();

      tabBtn('tab-chat').click();
      jest.runAllTimers();
      expect(resize).toHaveBeenCalled();
    });
  });

  describe('duplicate module instance (stale ?v= cross-import)', () => {
    test('the click listener is bound once, so a tab switch cannot collapse the drawer', () => {
      loadRoomModule();
      loadRoomModule();   // second instance — what a stale ?v= produces

      expect(document.body.dataset.roomTabsBound).toBe('1');

      tabBtn('tab-users').click();   // ordinary switch, wide viewport

      expect(activeTab()).toBe('tab-users');
      expect(collapsed()).toBe(false);   // ← would be true with a double binding
    });

    test('re-clicking the active tab still toggles exactly once under a double load', () => {
      loadRoomModule();
      loadRoomModule();

      tabBtn('tab-chat').click();
      expect(collapsed()).toBe(true);    // one toggle, not two cancelling out
    });
  });
});
