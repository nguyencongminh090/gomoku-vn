/**
 * Strict presence: a player is "away" (orange dot) when the tab is hidden OR the window lost
 * focus (another window/program in front) — so a second client during play can't read as online.
 *
 * @jest-environment jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');
const JS = (n) => fs.readFileSync(path.join(__dirname, '..', 'js', n), 'utf8');

function load() {
  document.body.innerHTML = '<div id="board-area"></div><div id="chat-messages"></div><div id="room-entry-overlay"></div>';
  const client = {
    socket: { connected: false }, listeners: {}, plainEmits: [],
    on(e, cb) { this.listeners[e] = cb; return this; },
    emit(e, d) { this.plainEmits.push({ event: e, data: d }); },
    emitAck() {},
  };
  window.RoomClient = client;
  window.ChatUI = { appendSystemMessage: jest.fn(), appendChatMessage: jest.fn(), showFloatMessage: jest.fn() };
  window.RoomUI = { updateUI: jest.fn() };
  window.RoomState = { myUser: { userId: 'me' }, roomData: { roomId: 'r1' }, predictedTurn: { active: false }, boardRenderer: null };
  window.eval(JS('timer-sync-core.js'));
  window.eval(JS('i18n.js'));
  window.eval(JS('game-ui.js'));
  for (const fn of ['updateBoardState', 'renderDrawPrompt', 'renderUndoPrompt', 'renderTimePrompt',
    'initBoard', 'renderSwap2', 'renderTimers', 'renderGameControls', 'setTurnBarVisible']) window.GameUI[fn] = jest.fn();
  window.eval(JS('room-socket.js'));
  return client;
}

let focused;
beforeEach(() => {
  jest.useFakeTimers();
  focused = true;
  document.hasFocus = () => focused;
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

const presences = (c) => c.plainEmits.filter((x) => x.event === 'room:presence').map((x) => x.data.presence);

test('window blur (tab still visible) reports away; focus reports active', () => {
  const c = load();
  focused = false; window.dispatchEvent(new Event('blur'));
  expect(presences(c)).toEqual(['away']);
  focused = true; window.dispatchEvent(new Event('focus'));
  expect(presences(c)).toEqual(['away', 'active']);
});

test('duplicate events do not re-emit', () => {
  const c = load();
  focused = false;
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('blur'));
  expect(presences(c)).toEqual(['away']);
});

test('missed blur is caught by the poll', () => {
  const c = load();
  focused = false;
  jest.advanceTimersByTime(2100);
  expect(presences(c)).toEqual(['away']);
});

test('no emit outside a room', () => {
  const c = load();
  window.RoomState.roomData = null;
  focused = false; window.dispatchEvent(new Event('blur'));
  expect(presences(c)).toEqual([]);
});
