/**
 * TODO.md #182 — host-only "Ranked" toggle in room settings + own rating delta
 * shown after a ranked game (server: #175, `room.settings.ranked`, `rating:update`).
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/room.html?id=%23ABC"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const JS = (name) => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
const BODY_HTML = (() => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
  return html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
})();

const baseSettings = {
  boardSize: 17, winningRule: 'freestyle', ruleWall: false, rulePortal: false, ruleSwap2: false,
  timerMode: 'per_move', timerSeconds: 60, timerIncrementSeconds: 0,
};

function user(userId, slot, isGuest = false) {
  return { userId, displayName: userId, slot, isGuest, role: slot ? 'player' : 'guest', presence: 'active' };
}

// ── room-ui: the toggle ────────────────────────────────────────────────────

function renderHostSettings(settings, users) {
  jest.resetModules();
  document.body.innerHTML = BODY_HTML;
  document.documentElement.setAttribute('data-ui-mode', 'default');
  window.t = jest.fn((key) => key);
  window.EscapeUtils = require('../js/escape-utils.js');
  window.RoomState = {
    roomData: { state: 'waiting', settings, users },
    myRole: 'host',
    myUser: { userId: 'me', displayName: 'Me' },
  };
  window.RoomClient = { emit: jest.fn() };
  require('../js/room-ui.js');
  window.RoomUI.renderSettings();
  return document.getElementById('r-ranked');
}

describe('room settings: Ranked toggle', () => {
  test('missing setting (old server payload) → checked, default ON', () => {
    const box = renderHostSettings(baseSettings, [user('me', 1), user('b', 2)]);
    expect(box).not.toBeNull();
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
    expect(box.getAttribute('aria-label')).toBe('room.ranked');
  });

  test('ranked:false → unchecked', () => {
    const box = renderHostSettings({ ...baseSettings, ranked: false }, [user('me', 1), user('b', 2)]);
    expect(box.checked).toBe(false);
  });

  test('a seated guest disables the toggle but keeps its stored value visible', () => {
    const box = renderHostSettings({ ...baseSettings, ranked: true }, [user('me', 1), user('g', 2, true)]);
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(true);
    expect(document.body.innerHTML).toContain('room.ranked_guest_hint');
  });

  test('a guest who is only watching (no slot) does not disable it', () => {
    const box = renderHostSettings(baseSettings, [user('me', 1), user('b', 2), user('w', null, true)]);
    expect(box.disabled).toBe(false);
  });

  test.each([[true], [false]])('updateSettings sends ranked=%p', (value) => {
    const box = renderHostSettings({ ...baseSettings, ranked: value }, [user('me', 1), user('b', 2)]);
    expect(box.checked).toBe(value);
    window.updateSettings();
    expect(window.RoomClient.emit).toHaveBeenCalledWith(
      'room:settings', { settings: expect.objectContaining({ ranked: value }) }
    );
  });

  test('toggling the box is what gets sent', () => {
    const box = renderHostSettings(baseSettings, [user('me', 1), user('b', 2)]);
    box.checked = false;
    window.updateSettings();
    expect(window.RoomClient.emit.mock.calls[0][1].settings.ranked).toBe(false);
  });
});

// ── room-socket: rating:update ─────────────────────────────────────────────

function loadSocket() {
  jest.resetModules();
  document.body.innerHTML = '<div id="board-area"></div><div id="chat-messages"></div>';
  const listeners = {};
  window.RoomClient = {
    socket: { connected: false },
    on(e, cb) { listeners[e] = cb; return this; },
    emit() {}, emitAck() {},
  };
  window.ChatUI = { appendSystemMessage: jest.fn(), appendChatMessage: jest.fn(), showFloatMessage: jest.fn() };
  window.RoomUI = { updateUI: jest.fn() };
  window.RoomState = { myUser: { userId: 'me' }, roomData: null, predictedTurn: { active: false }, boardRenderer: null };
  window.eval(JS('timer-sync-core.js'));
  window.eval(JS('i18n.js'));
  window.eval(JS('game-ui.js'));
  for (const fn of ['updateBoardState', 'renderDrawPrompt', 'renderUndoPrompt', 'renderTimePrompt',
    'initBoard', 'renderSwap2', 'renderTimers', 'renderGameControls', 'setTurnBarVisible']) {
    window.GameUI[fn] = jest.fn();
  }
  window.eval(JS('room-socket.js'));
  return listeners;
}

describe('rating:update → own delta in the room log', () => {
  const payload = (me, over = {}) => ({
    gameId: 'g', category: 'caro',
    players: [{ userId: 'me', before: 1200, after: 1262, delta: 62, rd: 290, provisional: true, ...me },
              { userId: 'other', before: 1200, after: 1138, delta: -62, rd: 290, provisional: true }],
    ...over,
  });

  test('shows my line only: category, before → after, signed delta, provisional tag', () => {
    const l = loadSocket();
    window.setLanguage && window.setLanguage('en');
    l['rating:update'](payload({}));
    expect(window.ChatUI.appendSystemMessage).toHaveBeenCalledTimes(1);
    const text = window.ChatUI.appendSystemMessage.mock.calls[0][0];
    expect(text).toContain('Caro');
    expect(text).toContain('1200 → 1262');
    expect(text).toContain('(+62)');
    expect(text).toContain('provisional');
    expect(text).not.toContain('1138');
  });

  test('loss shows a minus, settled rating has no provisional tag', () => {
    const l = loadSocket();
    window.setLanguage && window.setLanguage('en');
    l['rating:update'](payload({ after: 1180, delta: -20, provisional: false }));
    const text = window.ChatUI.appendSystemMessage.mock.calls[0][0];
    expect(text).toContain('(−20)');
    expect(text).not.toContain('provisional');
  });

  test.each([
    ['spectator (not in players)', { players: [{ userId: 'x', before: 1, after: 2, delta: 1 }] }],
    ['no players array',           { players: undefined }],
  ])('%s → nothing shown, no crash', (_l, over) => {
    const l = loadSocket();
    l['rating:update'](payload({}, over));
    expect(window.ChatUI.appendSystemMessage).not.toHaveBeenCalled();
  });
});
