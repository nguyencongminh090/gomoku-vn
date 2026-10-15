/**
 * TODO.md #114 / docs/fix-log — slot status dot's Active/Inactive branch used
 * to key off `player.ready`, which GameHandler.js's startGame() resets to
 * `false` the instant a game starts — so the dot fell back to the
 * "not ready" look right when a game began, reading as the player's status
 * incorrectly resetting. This guards the fix: Active/Inactive must come from
 * `room.state === 'playing'`, independent of `ready`.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOM_UI_JS_PATH = path.join(__dirname, '..', 'js', 'room-ui.js');
const ROOM_UI_JS_SOURCE = fs.readFileSync(ROOM_UI_JS_PATH, 'utf8');

function loadRoomUI() {
  delete window.RoomUI;
  document.body.innerHTML = `
    <div id="room-id-nav"></div>
    <div id="seatcard-top"></div>
    <div id="seatcard-bottom"></div>
    <div id="settings-panel"></div>
    <div id="settings-body"></div>
    <div id="users-panel"></div>
    <div id="users-list"></div>
    <div id="score-panel"></div>
    <div id="score-body"></div>
  `;
  window.t = (key) => key;
  window.EscapeUtils = { escapeAttr: (s) => s, escapeHtml: (s) => s };
  // room-ui.js is a plain (non-module) script that assigns `window.RoomUI`;
  // evaluate it fresh in this test's jsdom global each time, matching how the
  // browser loads it via a <script> tag (same pattern as
  // board-touch-scroll-prevention.test.js).
  // eslint-disable-next-line no-eval
  window.eval(ROOM_UI_JS_SOURCE);
  return window.RoomUI;
}

function makePlayer(overrides = {}) {
  return {
    userId: 'p1',
    displayName: 'Player 1',
    slot: 1,
    ready: false,
    presence: 'active',
    ...overrides,
  };
}

function dotModifierIn(contentEl) {
  const dot = contentEl.querySelector('.ready-dot');
  expect(dot).not.toBeNull();
  const modifiers = Array.from(dot.classList).filter((c) => c !== 'ready-dot');
  return modifiers[0] || null; // null = no modifier (Inactive/waiting)
}

// Since #216 the seat lives on a player card; a spectator sees seat #1 at the bottom.
describe('playerStatusInfo via the player cards (TODO #114)', () => {
  let RoomUI;
  let contentEl;

  beforeEach(() => {
    RoomUI = loadRoomUI();
    contentEl = document.getElementById('seatcard-bottom');
  });

  test('room playing + ready=true (post-startGame reset) still shows Active, not Inactive', () => {
    window.RoomState = {
      roomData: { state: 'playing', users: [makePlayer({ ready: false })] },
      myUser: { userId: 'someone-else' },
      mySlot: null,
    };
    RoomUI.renderPlayerCards();
    expect(dotModifierIn(contentEl)).toBe('ready-dot--active');
  });

  test('room not playing (waiting for seats / pre-start) shows Inactive regardless of ready', () => {
    window.RoomState = {
      roomData: { state: 'waiting', users: [makePlayer({ ready: true })] },
      myUser: { userId: 'someone-else' },
      mySlot: null,
    };
    RoomUI.renderPlayerCards();
    expect(dotModifierIn(contentEl)).toBeNull();
  });

  test('away beats Active even mid-game', () => {
    window.RoomState = {
      roomData: { state: 'playing', users: [makePlayer({ presence: 'away' })] },
      myUser: { userId: 'someone-else' },
      mySlot: null,
    };
    RoomUI.renderPlayerCards();
    expect(dotModifierIn(contentEl)).toBe('ready-dot--away');
  });

  test('disconnected beats away and Active', () => {
    window.RoomState = {
      roomData: { state: 'playing', users: [makePlayer({ presence: 'disconnected' })] },
      myUser: { userId: 'someone-else' },
      mySlot: null,
    };
    RoomUI.renderPlayerCards();
    expect(dotModifierIn(contentEl)).toBe('ready-dot--disconnected');
  });
});
