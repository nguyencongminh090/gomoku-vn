/**
 * TODO.md #170 — the server-clock offset must be populated DURING THE READY
 * PHASE, not just once a game is running.
 *
 * The original "just swap Date.now() for serverNow()" idea was a no-op: room-
 * socket.js only ever set `clockOffsetMs` from `timer:sync`, which does not
 * exist until a game starts, so through the whole Start-modal ready window the
 * offset was still 0 and serverNow() === Date.now().
 *
 * The real fix stamps `serverTime` onto the room:joined / room:updated payloads
 * (server/managers/RoomManager.js, server/socket/state.js) and has room-socket.js
 * fold it into `clockOffsetMs` with the same TimerSyncCore formula timer:sync
 * uses. This suite guards that wiring: serverNow() (newly exported on
 * global.RoomSocket) tracks the server clock as soon as the first room packet
 * lands, well before any timer:sync.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const JS = (name) => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
const TIMER_SYNC_CORE_SOURCE = JS('timer-sync-core.js');
const I18N_SOURCE            = JS('i18n.js');
const GAME_UI_SOURCE         = JS('game-ui.js');
const ROOM_SOCKET_SOURCE     = JS('room-socket.js');

function makeClientStub() {
  return {
    socket: { connected: false },
    listeners: {},
    plainEmits: [],
    on(event, cb) { this.listeners[event] = cb; return this; },
    emit(event, data) { this.plainEmits.push({ event, data }); },
    emitAck() {},
  };
}

function loadRoomModules() {
  document.body.innerHTML =
    '<div id="board-area"></div><div id="chat-messages"></div>' +
    '<div id="room-entry-overlay"></div>';

  const client = makeClientStub();
  window.RoomClient = client;
  window.ChatUI = {
    appendSystemMessage: jest.fn(), appendChatMessage: jest.fn(), showFloatMessage: jest.fn(),
  };
  window.RoomUI = { updateUI: jest.fn() };
  window.RoomState = {
    myUser: { userId: 'me' },
    roomData: null,
    predictedTurn: { active: false },
    boardRenderer: null,
  };

  window.eval(TIMER_SYNC_CORE_SOURCE);
  window.eval(I18N_SOURCE);
  window.eval(GAME_UI_SOURCE);
  for (const fn of ['updateBoardState', 'renderDrawPrompt', 'renderUndoPrompt', 'renderTimePrompt',
    'initBoard', 'renderSwap2', 'renderTimers', 'renderGameControls', 'setTurnBarVisible']) {
    window.GameUI[fn] = jest.fn();
  }
  window.eval(ROOM_SOCKET_SOURCE);

  return { client };
}

/** Minimal room:joined / room:updated payload. */
function roomPayload(overrides = {}) {
  return {
    roomId: 'r1',
    roomName: 'R',
    state: 'waiting',
    users: [{ userId: 'me', displayName: 'Me', slot: 1, role: 'player', presence: 'active' }],
    readyDeadline: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(Date.parse('2026-08-29T00:00:00.000Z'));
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('room-socket.js — serverNow() export + ready-phase clock offset (TODO.md #170)', () => {
  test('serverNow is exposed as a function on global.RoomSocket', () => {
    loadRoomModules();
    expect(typeof window.RoomSocket.serverNow).toBe('function');
  });

  test('before any packet, serverNow() === Date.now() (offset 0, i.e. old behaviour)', () => {
    loadRoomModules();
    expect(window.RoomSocket.serverNow()).toBe(Date.now());
  });

  test('room:joined carrying serverTime sets the offset immediately (no timer:sync needed)', () => {
    const { client } = loadRoomModules();
    const now = Date.now();

    client.listeners['room:joined'](roomPayload({ serverTime: now - 8400 }));

    // -8400ms skew: our clock is 8.4s ahead of the server's
    expect(window.RoomSocket.serverNow()).toBe(now - 8400);
  });

  test('room:updated carrying serverTime updates the offset', () => {
    const { client } = loadRoomModules();
    client.listeners['room:joined'](roomPayload({ serverTime: Date.now() }));
    expect(window.RoomSocket.serverNow()).toBe(Date.now());

    client.listeners['room:updated'](roomPayload({ serverTime: Date.now() + 5000 }));
    expect(window.RoomSocket.serverNow()).toBe(Date.now() + 5000);
  });

  test('a payload with no serverTime leaves the offset untouched', () => {
    const { client } = loadRoomModules();
    client.listeners['room:joined'](roomPayload({ serverTime: Date.now() - 8400 }));
    const skewed = window.RoomSocket.serverNow();

    client.listeners['room:updated'](roomPayload()); // no serverTime
    expect(window.RoomSocket.serverNow()).toBe(skewed);
  });

  test('a NaN / non-numeric serverTime is ignored (no offset corruption)', () => {
    const { client } = loadRoomModules();
    client.listeners['room:joined'](roomPayload({ serverTime: 'oops' }));
    expect(window.RoomSocket.serverNow()).toBe(Date.now());

    client.listeners['room:updated'](roomPayload({ serverTime: NaN }));
    expect(window.RoomSocket.serverNow()).toBe(Date.now());
  });
});
