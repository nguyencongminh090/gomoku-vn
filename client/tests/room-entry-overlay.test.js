/**
 * Room-entry overlay on slow networks: delayed show (no flash on fast loads),
 * fade-out on room:joined, "slow connection" hint, reduced-motion, i18n.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const CSS = read('css', 'game.css');
const HTML = read('room.html');
const I18N = read('js', 'i18n.js');

function loadRoom() {
  document.body.innerHTML =
    '<div id="board-area"></div><div id="chat-messages"></div>' +
    '<div class="game-overlay visible" id="room-entry-overlay"></div>';
  const client = {
    socket: { connected: false }, listeners: {},
    on(e, cb) { this.listeners[e] = cb; return this; }, emit() {}, emitAck() {},
  };
  window.RoomClient = client;
  window.ChatUI = { appendSystemMessage: jest.fn(), appendChatMessage: jest.fn(), showFloatMessage: jest.fn() };
  window.RoomUI = { updateUI: jest.fn() };
  window.RoomState = { myUser: { userId: 'me' }, roomData: null, predictedTurn: { active: false }, boardRenderer: null };
  window.eval(read('js', 'timer-sync-core.js'));
  window.eval(I18N);
  window.eval(read('js', 'game-ui.js'));
  for (const fn of ['updateBoardState', 'renderDrawPrompt', 'renderUndoPrompt', 'renderTimePrompt',
    'initBoard', 'renderSwap2', 'renderTimers', 'renderGameControls', 'setTurnBarVisible']) {
    window.GameUI[fn] = jest.fn();
  }
  window.eval(read('js', 'room-socket.js'));
  return client;
}

const payload = { roomId: 'r1', roomName: 'R', state: 'waiting', readyDeadline: null,
  users: [{ userId: 'me', displayName: 'Me', slot: 1, role: 'player', presence: 'active' }] };

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe('hideEntryOverlay (room-socket.js)', () => {
  test('room:joined fades the overlay out, then removes .visible', () => {
    const client = loadRoom();
    const el = document.getElementById('room-entry-overlay');
    client.listeners['room:joined'](payload);
    expect(el.classList.contains('leaving')).toBe(true);
    expect(el.classList.contains('visible')).toBe(true); // still fading
    jest.advanceTimersByTime(300);
    expect(el.classList.contains('visible')).toBe(false);
    expect(el.classList.contains('leaving')).toBe(false);
  });

  test('only the overlay itself ending its animation finishes it (child animationend bubbling is ignored); resync is a no-op', () => {
    const client = loadRoom();
    const el = document.getElementById('room-entry-overlay');
    client.listeners['room:joined'](payload);
    el.querySelector('.game-overlay__card') || el.appendChild(Object.assign(document.createElement('div'), { className: 'game-overlay__card' }));
    el.firstElementChild.dispatchEvent(new Event('animationend', { bubbles: true }));
    expect(el.classList.contains('visible')).toBe(true);
    el.dispatchEvent(new Event('animationend'));
    expect(el.classList.contains('visible')).toBe(false);
    client.listeners['room:joined'](payload);
    expect(el.classList.contains('leaving')).toBe(false);
  });
});

describe('overlay styles + markup', () => {
  test('backdrop is shown at once; only the card is delayed (no flash, chrome stays hidden)', () => {
    expect(CSS).toMatch(/\.game-overlay\.visible\s*\{\s*display:\s*flex;\s*\}/);
    expect(CSS).toMatch(/\.game-overlay__card\s*\{[^}]*animation:\s*card-slide-in\s+0\.3s[^;]*0\.5s\s+both/);
  });
  test('no full-screen backdrop-filter on the overlay', () => {
    const block = CSS.replace(/\/\*[\s\S]*?\*\//g, '').match(/\.game-overlay\s*\{[^}]*\}/)[0];
    expect(block).not.toMatch(/backdrop-filter/);
  });
  test('fade-out, spinning icon and reduced-motion rules exist', () => {
    expect(CSS).toMatch(/\.game-overlay\.leaving\s*\{/);
    expect(CSS).toMatch(/@keyframes overlay-fade-out/);
    expect(CSS).toMatch(/\.game-overlay__icon svg\s*\{[^}]*overlay-spin/);
    expect(CSS).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^}]*\.game-overlay\.leaving/);
  });
  test('slow hint is data-i18n and the key exists in vi and en', () => {
    expect(HTML).toMatch(/class="game-overlay__slow"\s+data-i18n="conn\.lagging"/);
    expect((I18N.match(/'conn\.lagging':/g) || []).length).toBe(2);
  });
});
