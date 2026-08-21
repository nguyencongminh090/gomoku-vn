/**
 * TODO.md #134 / docs/fix-log/*-todo-134-sidebar-drawer-stuck-collapsed.md
 *
 * client/js/room-socket.js's `game:init` handler adds `zen-drawer-collapsed`
 * to <body> based on a ONE-TIME `matchMedia('(max-width: 768px)').matches`
 * check. Nothing used to ever remove that class once the viewport widened
 * back past 768px (no resize/matchMedia-change listener touched it) — so if
 * the viewport was narrow for even a moment right when a match's game:init
 * fired (a docked DevTools panel, a window mid-resize), the drawer collapsed
 * to its icon-only rail and stayed that way forever, regardless of how wide
 * the window became afterward. Reported by the user with DevTools evidence:
 * `body.zen-drawer-collapsed` present at a 1920x935 viewport.
 *
 * This guards the fix in client/js/room.js: a `matchMedia('(max-width:
 * 768px)')` 'change' listener that ONLY clears the stuck class once the
 * viewport is provably no longer narrow — it must never itself add the
 * class (that stays room-socket.js's job on game:init), and must not clear
 * it while the viewport is still narrow.
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

let lastMql;
let lastBoardRenderer;

// Real matchMedia doesn't exist in jsdom. Stub it with something that lets
// a test flip `matches` and fire the 'change' listener room.js registers —
// mirroring how a real browser fires it when the viewport crosses 768px.
function installMatchMediaMock() {
  const listeners = [];
  lastMql = {
    matches: false,
    media: '(max-width: 768px)',
    addEventListener: jest.fn((type, cb) => { if (type === 'change') listeners.push(cb); }),
    removeEventListener: jest.fn(),
    fireChange(matches) {
      this.matches = matches;
      listeners.slice().forEach((cb) => cb({ matches }));
    },
  };
  window.matchMedia = jest.fn(() => lastMql);
}

function setupPage() {
  document.body.innerHTML = BODY_HTML;
  document.body.className = 'zen-room'; // matches room.html's real <body class="zen-room">

  window.GvnSession = {
    requireAuth: jest.fn(),
    getUser: jest.fn(() => ({ userId: 'u-1', displayName: 'Test User', isGuest: false })),
  };
  window.t = jest.fn((key) => key);
  window.requestAnimationFrame = jest.fn((cb) => cb());

  window.SocketClient = class {
    constructor() { this._handlers = {}; }
    emit() {}
    on(event, cb) { (this._handlers[event] = this._handlers[event] || []).push(cb); }
    bindStatusBanner() {}
  };

  installMatchMediaMock();
}

function loadRoomModule() {
  jest.resetModules();
  require('../js/room.js');

  lastBoardRenderer = { resize: jest.fn() };
  window.RoomState.boardRenderer = lastBoardRenderer;
}

describe('room.js: zen-drawer-collapsed does not get stuck past its mobile breakpoint (TODO.md #134)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('stuck collapsed drawer clears once the viewport widens past 768px, and re-fits the board', () => {
    setupPage();
    loadRoomModule();

    // Simulate room-socket.js's game:init having collapsed the drawer while
    // the viewport was momentarily narrow.
    document.body.classList.add('zen-drawer-collapsed');

    lastMql.fireChange(false); // viewport no longer matches (max-width: 768px)

    expect(document.body.classList.contains('zen-drawer-collapsed')).toBe(false);
    expect(lastBoardRenderer.resize).toHaveBeenCalled();
  });

  test('does not clear the collapsed state while the viewport is still narrow', () => {
    setupPage();
    loadRoomModule();

    document.body.classList.add('zen-drawer-collapsed');

    lastMql.fireChange(true); // still <= 768px

    expect(document.body.classList.contains('zen-drawer-collapsed')).toBe(true);
    expect(lastBoardRenderer.resize).not.toHaveBeenCalled();
  });

  test('never proactively adds the collapsed class itself — only clears', () => {
    setupPage();
    loadRoomModule();

    expect(document.body.classList.contains('zen-drawer-collapsed')).toBe(false);

    lastMql.fireChange(true); // viewport goes narrow

    // Auto-collapsing on narrow viewport stays room-socket.js's job (on
    // game:init); this listener must not do it too.
    expect(document.body.classList.contains('zen-drawer-collapsed')).toBe(false);
  });

  test('is a no-op when the drawer was never collapsed', () => {
    setupPage();
    loadRoomModule();

    lastMql.fireChange(false);

    expect(document.body.classList.contains('zen-drawer-collapsed')).toBe(false);
    expect(lastBoardRenderer.resize).not.toHaveBeenCalled();
  });
});
