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

// #373 supersedes #157's dots: the list shows only viewers actually watching (presence 'active');
// 'away' / 'disconnected' viewers are left out of the list, the tab and the audience stack.
describe('room-ui.js: viewer list shows only viewers who are watching (#373)', () => {
  test('an active guest is listed, with no status dot', () => {
    setupPage();
    loadRoomUiModule({ state: 'waiting', users: [makeGuest({ presence: 'active' })] });
    window.RoomUI.renderUsersList();
    const li = document.querySelector('#users-list li');
    expect(li.textContent).toContain('Guest One');
    expect(li.querySelector('.ready-dot')).toBeNull();
  });

  test('a guest with no presence field counts as active', () => {
    setupPage();
    loadRoomUiModule({ state: 'waiting', users: [makeGuest({ presence: undefined })] });
    window.RoomUI.renderUsersList();
    expect(document.querySelectorAll('#users-list li')).toHaveLength(1);
  });

  test.each(['away', 'disconnected'])('a %s guest is not listed; the list panel hides when nobody watches', (presence) => {
    setupPage();
    loadRoomUiModule({ state: 'waiting', users: [makeGuest({ presence })] });
    window.RoomUI.renderUsersList();
    expect(document.querySelectorAll('#users-list li')).toHaveLength(0);
    expect(document.getElementById('users-panel').style.display).toBe('none');
  });

  test('mixed list: only the watching guest is listed; audience stack gets the same list', () => {
    setupPage();
    const audience = jest.fn();
    window.RoomStage = { active: () => false, renderAudience: audience };
    loadRoomUiModule({
      state: 'waiting',
      users: [
        makeGuest({ userId: 'g-1', displayName: 'Active Guest', presence: 'active' }),
        makeGuest({ userId: 'g-2', displayName: 'Ghost Guest', presence: 'disconnected' }),
        makeGuest({ userId: 'g-3', displayName: 'Away Guest', presence: 'away' }),
        { userId: 'p-1', displayName: 'Seated', slot: 1, role: 'guest', presence: 'active' },
      ],
    });
    window.RoomUI.renderUsersList();
    delete window.RoomStage;
    const items = document.querySelectorAll('#users-list li');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('Active Guest');
    expect(audience).toHaveBeenCalledWith([expect.objectContaining({ userId: 'g-1' })]);
  });
});
