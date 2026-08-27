/**
 * TODO.md #157
 *
 * client/js/room-ui.js's renderUsersList() (the "Khán giả" / tab-users list)
 * built its <li> from displayName + host badge + kick button only — it never
 * read `presence`, even though the server sets `presence = 'disconnected'`
 * for a viewer whose socket dropped and broadcasts it via room:updated
 * (DisconnectHandler.js). A disconnected viewer therefore looked identical to
 * one actually present, and — per TODO.md #115 — a viewer's disconnected
 * state has no reconnect timeout, so this could persist indefinitely.
 *
 * This guards the fix: renderUsersList() now renders the same status dot
 * used for seated players (renderStatusDot/playerStatusInfo) next to a
 * guest's name whenever presence is 'disconnected' or 'away', and renders no
 * dot at all for a normally-connected guest (same noise tradeoff already
 * used for players).
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
  document.documentElement.setAttribute('data-ui-mode', 'default');

  window.t = jest.fn((key) => key);
}

function loadRoomUiModule(roomData) {
  jest.resetModules();
  window.EscapeUtils = require('../js/escape-utils.js');

  window.RoomState = {
    roomData,
    myRole: 'guest',
    myUser: { userId: 'me', displayName: 'Me' },
  };

  require('../js/room-ui.js');
}

function makeGuest(overrides) {
  return {
    userId: 'g-1',
    displayName: 'Guest One',
    slot: null,
    role: 'guest',
    presence: 'active',
    ...overrides,
  };
}

describe('room-ui.js: viewer list reflects disconnected/away presence (TODO.md #157)', () => {
  test('a normally-connected guest renders with no status dot', () => {
    setupPage();
    loadRoomUiModule({ state: 'waiting', users: [makeGuest({ presence: 'active' })] });

    window.RoomUI.renderUsersList();

    const li = document.querySelector('#users-list li');
    expect(li.textContent).toContain('Guest One');
    expect(li.querySelector('.ready-dot')).toBeNull();
  });

  test('a disconnected guest renders the disconnected status dot', () => {
    setupPage();
    loadRoomUiModule({ state: 'waiting', users: [makeGuest({ presence: 'disconnected' })] });

    window.RoomUI.renderUsersList();

    const dot = document.querySelector('#users-list li .ready-dot');
    expect(dot).not.toBeNull();
    expect(dot.classList.contains('ready-dot--disconnected')).toBe(true);
  });

  test('an away guest renders the away status dot', () => {
    setupPage();
    loadRoomUiModule({ state: 'waiting', users: [makeGuest({ presence: 'away' })] });

    window.RoomUI.renderUsersList();

    const dot = document.querySelector('#users-list li .ready-dot');
    expect(dot).not.toBeNull();
    expect(dot.classList.contains('ready-dot--away')).toBe(true);
  });

  test('mixed list: only the disconnected guest gets a dot, the active one does not', () => {
    setupPage();
    loadRoomUiModule({
      state: 'waiting',
      users: [
        makeGuest({ userId: 'g-1', displayName: 'Active Guest', presence: 'active' }),
        makeGuest({ userId: 'g-2', displayName: 'Ghost Guest', presence: 'disconnected' }),
      ],
    });

    window.RoomUI.renderUsersList();

    const items = document.querySelectorAll('#users-list li');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('.ready-dot')).toBeNull();
    expect(items[1].querySelector('.ready-dot--disconnected')).not.toBeNull();
  });
});
