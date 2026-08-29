/**
 * TODO.md #170
 *
 * room-ui.js's renderStartModal() counted the ready window down with
 *
 *     Math.ceil((deadline - Date.now()) / 1000)
 *
 * where `deadline` (st.roomData.readyDeadline) is a SERVER-clock epoch but
 * Date.now() is the client's wall clock. On a machine whose clock is skewed
 * (measured: -8.4s on one real player, wbcplayer/CN) the countdown was wrong by
 * exactly that skew — showing 0 with time left, or vice versa.
 *
 * The fix: room-socket.js exposes serverNow() (Date.now() + clockOffsetMs), and
 * keeps clockOffsetMs populated during the ready phase too by reading the
 * `serverTime` stamp now carried on room:joined / room:updated (before the
 * fix, clockOffsetMs was only ever set by timer:sync, which does not exist
 * until a game is running). renderStartModal() now subtracts serverNow(), with
 * a Date.now() fallback for when room-socket.js has not finished loading.
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

const NOW = Date.parse('2026-08-29T00:00:00.000Z');

function setupPage() {
  document.body.innerHTML = BODY_HTML;
  document.documentElement.setAttribute('data-ui-mode', 'default');
  window.t = jest.fn((key) => key);
}

/** Load room-ui.js against a stubbed RoomState; `serverClockOffset === null`
 *  means "room-socket.js not loaded" (no global.RoomSocket at all). */
function loadRoomUi({ readyDeadline, serverClockOffset }) {
  jest.resetModules();
  window.EscapeUtils = require('../js/escape-utils.js');

  if (serverClockOffset === null) {
    delete window.RoomSocket;
  } else {
    window.RoomSocket = { serverNow: () => Date.now() + serverClockOffset };
  }

  window.RoomState = {
    mySlot: 1,
    isReady: false,
    myRole: 'player',
    myUser: { userId: 'me', displayName: 'Me' },
    roomData: {
      state: 'waiting',
      readyDeadline,
      users: [
        { userId: 'me', displayName: 'Me', slot: 1, role: 'player', presence: 'active' },
        { userId: 'opp', displayName: 'Opp', slot: 2, role: 'player', presence: 'active' },
      ],
    },
  };

  require('../js/room-ui.js');
}

function shownSeconds() {
  return document.getElementById('start-modal-countdown').textContent;
}

describe('room-ui.js renderStartModal(): ready countdown uses the server clock (TODO.md #170)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    setupPage();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('offset 0 — unchanged from the old Date.now() behaviour', () => {
    // deadline 15s ahead on both clocks (they agree)
    loadRoomUi({ readyDeadline: NOW + 15000, serverClockOffset: 0 });
    window.RoomUI.renderStartModal();
    expect(shownSeconds()).toBe('15');
  });

  test('large negative offset (-8400ms, the real wbcplayer measurement) — no longer over-counts', () => {
    const serverClockOffset = -8400;
    // 15s of ready window, expressed against the SERVER clock
    const readyDeadline = NOW + serverClockOffset + 15000;
    loadRoomUi({ readyDeadline, serverClockOffset });

    window.RoomUI.renderStartModal();

    // serverNow() = NOW - 8400  ⇒ deadline - serverNow() = 15000 ⇒ 15s
    expect(shownSeconds()).toBe('15');
    // (the bug showed Math.ceil((-8400 + 15000)/1000) = 7)
  });

  test('positive offset (+5000ms) — no longer under-counts', () => {
    const serverClockOffset = 5000;
    const readyDeadline = NOW + serverClockOffset + 15000;
    loadRoomUi({ readyDeadline, serverClockOffset });

    window.RoomUI.renderStartModal();

    expect(shownSeconds()).toBe('15');
    // (the bug showed Math.ceil((5000 + 15000)/1000) = 20)
  });

  test('RoomSocket not yet loaded — falls back to Date.now(), i.e. exactly today\'s behaviour', () => {
    loadRoomUi({ readyDeadline: NOW + 12000, serverClockOffset: null });
    window.RoomUI.renderStartModal();
    expect(shownSeconds()).toBe('12');
  });

  test('boundary: deadline exactly equals serverNow() ⇒ 0', () => {
    const serverClockOffset = -8400;
    loadRoomUi({ readyDeadline: NOW + serverClockOffset, serverClockOffset });
    window.RoomUI.renderStartModal();
    expect(shownSeconds()).toBe('0');
  });

  test('boundary: deadline already past ⇒ clamped at 0, never negative', () => {
    const serverClockOffset = -8400;
    loadRoomUi({ readyDeadline: NOW + serverClockOffset - 3000, serverClockOffset });
    window.RoomUI.renderStartModal();
    expect(shownSeconds()).toBe('0');
  });

  test('one step either side of a whole second (ceil semantics preserved)', () => {
    // 9.001s left on the server clock ⇒ ceil ⇒ 10
    loadRoomUi({ readyDeadline: NOW + 9001, serverClockOffset: 0 });
    window.RoomUI.renderStartModal();
    expect(shownSeconds()).toBe('10');

    // 9.000s exactly ⇒ 9
    jest.resetModules();
    window.RoomSocket = { serverNow: () => Date.now() };
    window.RoomState.roomData.readyDeadline = NOW + 9000;
    require('../js/room-ui.js');
    window.RoomUI.renderStartModal();
    expect(shownSeconds()).toBe('9');
  });

  test('the interval keeps using the server clock as wall-time advances', () => {
    const serverClockOffset = -8400;
    loadRoomUi({ readyDeadline: NOW + serverClockOffset + 15000, serverClockOffset });
    window.RoomUI.renderStartModal();
    expect(shownSeconds()).toBe('15');

    jest.advanceTimersByTime(3000); // 3s of real time pass; the stub tracks Date.now()
    expect(shownSeconds()).toBe('12');
  });
});
