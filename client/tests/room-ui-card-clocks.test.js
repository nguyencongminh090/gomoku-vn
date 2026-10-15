/**
 * Player cards + their clocks (TODO.md #216), carrying over the guarantees of
 * the mobile players-strip test it replaces (TODO.md #166):
 *
 * The cards read clock values and whose turn it is from the one shared pair
 * GameUI.effectiveTimerValues()/effectiveTurnColor() (#155 predictedTurn
 * overlay + #165 transit shave), so (a) the turn highlight flips the instant
 * predictedTurn goes active, also on the per-second path; (b) the numbers are
 * that shared value; (c) with no overlay they are the raw timer values.
 *
 * New in #216: seat order (you at the bottom, the opponent on top; a spectator
 * sees seat #2 on top), the empty-seat "take seat" button, low-time state, and
 * the Giao hữu / Xếp hạng badge following the server's effective rule.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const JS = (name) => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
const I18N_SOURCE    = JS('i18n.js');
const GAME_UI_SOURCE = JS('game-ui.js');
const ROOM_UI_SOURCE = JS('room-ui.js');

function setup({ predictedTurn, halfRttMs = 0, timerValues = { black: 60, white: 60 }, status = 'ongoing',
  mySlot = 1, users, gameState, settings } = {}) {
  document.body.innerHTML = `
    <span id="room-mode-badge" hidden></span>
    <div class="seatcard" id="seatcard-top"></div>
    <div class="seatcard" id="seatcard-bottom"></div>
  `;

  window.t = (key) => key;
  window.EscapeUtils = require('../js/escape-utils.js');
  window.RoomClient = { on() { return this; }, emit() {}, emitAck() {} };

  window.RoomState = {
    myUser:   { userId: 'me', displayName: 'Me' },
    myRole:   'player',
    mySlot,
    boardRenderer: null,
    timerValues,
    halfRttMs,
    predictedTurn: predictedTurn || { active: false, forColor: null, snapshotTimerValues: null, switchedAtLocalTs: null },
    roomData: {
      roomId: 'r1',
      state: 'playing',
      settings: settings || { timerSeconds: 60, ranked: true },
      users: users || [
        { userId: 'me',   displayName: 'Me Player', slot: 1, role: 'player', presence: 'active' },
        { userId: 'them', displayName: 'Foe',       slot: 2, role: 'player', presence: 'active' },
      ],
    },
    gameState: gameState === undefined ? {
      status,
      moveCount: 5,
      currentTurn: 'me',
      rated: true,
      swap2: null,
      players: [
        { userId: 'me',   color: 'BLACK' },
        { userId: 'them', color: 'WHITE' },
      ],
    } : gameState,
  };

  window.eval(I18N_SOURCE);
  window.eval(GAME_UI_SOURCE);
  window.eval(ROOM_UI_SOURCE);
}

const top = () => document.getElementById('seatcard-top');
const bottom = () => document.getElementById('seatcard-bottom');
const turn = (el) => el.classList.contains('seatcard--turn');
const clock = (el) => el.querySelector('[data-clock-text]').textContent;

describe('seat order', () => {
  test('a seated player is at the bottom, the opponent on top', () => {
    setup({ mySlot: 2, users: [
      { userId: 'them', displayName: 'Foe', slot: 1, role: 'player' },
      { userId: 'me', displayName: 'Me Player', slot: 2, role: 'player' },
    ], gameState: null });
    window.RoomUI.renderPlayerCards();
    expect(bottom().querySelector('.seatcard__name').textContent).toBe('Me Player');
    expect(top().querySelector('.seatcard__name').textContent).toBe('Foe');
  });

  test('a spectator sees seat #2 on top and seat #1 at the bottom', () => {
    setup({ mySlot: null, gameState: null });
    window.RoomUI.renderPlayerCards();
    expect(top().dataset.slot).toBe('2');
    expect(bottom().dataset.slot).toBe('1');
  });

  test('an empty seat offers "take seat" to a standing user only, never mid-game', () => {
    setup({ mySlot: null, gameState: null, users: [{ userId: 'them', displayName: 'Foe', slot: 1, role: 'player' }] });
    window.RoomState.roomData.state = 'waiting';
    window.RoomUI.renderPlayerCards();
    const sit = top().querySelector('[data-action="sitDown"]');
    expect(sit).not.toBeNull();
    expect(sit.getAttribute('data-arg')).toBe('2');

    window.RoomState.roomData.state = 'playing';
    window.RoomUI.renderPlayerCards();
    expect(top().querySelector('[data-action="sitDown"]')).toBeNull();
  });

  test('a name is rendered as text, never as markup', () => {
    setup({ gameState: null, users: [
      { userId: 'me', displayName: '<img src=x onerror=alert(1)>', slot: 1, role: 'player' },
    ] });
    window.RoomUI.renderPlayerCards();
    expect(bottom().querySelector('img')).toBeNull();
    expect(bottom().querySelector('.seatcard__name').textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('turn highlight follows predictedTurn (#166 carried over)', () => {
  test('with no predictedTurn the authoritative current turn is highlighted', () => {
    setup();
    window.RoomUI.renderPlayerCards();
    expect(turn(bottom())).toBe(true);   // me, BLACK
    expect(turn(top())).toBe(false);
  });

  test('predictedTurn.active flips to the opponent before currentTurn changes', () => {
    setup({ predictedTurn: { active: true, forColor: 'WHITE', snapshotTimerValues: { black: 50, white: 40 }, switchedAtLocalTs: Date.now() } });
    window.RoomUI.renderPlayerCards();
    expect(turn(top())).toBe(true);
    expect(turn(bottom())).toBe(false);
  });

  test('the per-second path alone (updateCardClocks) also moves the highlight', () => {
    setup();
    window.RoomUI.renderPlayerCards();
    expect(turn(bottom())).toBe(true);
    window.RoomState.predictedTurn = { active: true, forColor: 'WHITE', snapshotTimerValues: { black: 50, white: 40 }, switchedAtLocalTs: Date.now() };
    window.RoomUI.updateCardClocks();
    expect(turn(bottom())).toBe(false);
    expect(turn(top())).toBe(true);
  });

  test('a finished game highlights neither card', () => {
    setup({ status: 'finished' });
    window.RoomUI.renderPlayerCards();
    expect(turn(top())).toBe(false);
    expect(turn(bottom())).toBe(false);
  });
});

describe('clock numbers', () => {
  test('no overlay, halfRttMs 0 — the raw timer values, always M:SS', () => {
    setup({ timerValues: { black: 37, white: 125 } });
    window.RoomUI.renderPlayerCards();
    expect(clock(bottom())).toBe('0:37');
    expect(clock(top())).toBe('2:05');
  });

  test('predictedTurn snapshot — the shared value, not the stale live one', () => {
    setup({
      timerValues: { black: 99, white: 99 },
      predictedTurn: { active: true, forColor: 'WHITE', snapshotTimerValues: { black: 45, white: 30 }, switchedAtLocalTs: Date.now() - 3000 },
    });
    const vals = window.GameUI.effectiveTimerValues();
    window.RoomUI.renderPlayerCards();
    expect(clock(bottom())).toBe('0:45');
    expect(clock(top())).toBe(`0:${String(Math.floor(vals.white)).padStart(2, '0')}`);
  });

  test.each([[11, false], [10, true], [0, true]])('low-time state at %ss → %s', (secs, low) => {
    setup({ timerValues: { black: secs, white: 60 } });
    window.RoomUI.renderPlayerCards();
    expect(bottom().classList.contains('seatcard--low')).toBe(low);
    expect(top().classList.contains('seatcard--low')).toBe(false);
  });

  test('no game → no clock on the cards', () => {
    setup({ gameState: null });
    window.RoomUI.renderPlayerCards();
    expect(bottom().querySelector('[data-clock-text]')).toBeNull();
  });
});

describe('mode badge (Giao hữu / Xếp hạng)', () => {
  const badge = () => document.getElementById('room-mode-badge');

  test('a live game uses the server\'s rated flag', () => {
    setup();
    window.RoomUI.renderModeBadge();
    expect(badge().classList.contains('mode-badge--rated')).toBe(true);
    window.RoomState.gameState.rated = false;
    window.RoomUI.renderModeBadge();
    expect(badge().classList.contains('mode-badge--friendly')).toBe(true);
    expect(badge().textContent).toContain('Giao hữu');
  });

  test.each([
    ['ranked room, two members', { ranked: true }, false, true],
    ['room not ranked', { ranked: false }, false, false],
    ['ranked room with a guest seated', { ranked: true }, true, false],
  ])('before a game: %s', (_n, settings, guest, rated) => {
    setup({ gameState: null, settings, users: [
      { userId: 'me', displayName: 'Me', slot: 1, role: 'player' },
      { userId: 'g', displayName: 'Guest', slot: 2, role: 'player', isGuest: guest },
    ] });
    window.RoomUI.renderModeBadge();
    expect(badge().classList.contains(rated ? 'mode-badge--rated' : 'mode-badge--friendly')).toBe(true);
  });
});
