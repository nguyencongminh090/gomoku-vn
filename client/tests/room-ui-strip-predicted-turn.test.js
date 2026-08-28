/**
 * TODO.md #166 — port the #155 predictedTurn overlay + #165 transit-delay
 * compensation from the desktop turn bar down to the mobile players-strip.
 *
 * Before this, room-ui.js's renderStripPlayer()/updateStripTimers() read
 * `gameState.currentTurn` and `st.timerValues` straight — so on a phone the
 * whose-turn marker and the countdown of the player who just moved waited the
 * full round trip (exactly the lag #155 removed for desktop), and once #165
 * landed the strip kept over-counting by the transit delay the turn bar had
 * started shaving off.
 *
 * The fix routes both surfaces through the one pair of helpers
 * GameUI.effectiveTimerValues()/effectiveTurnColor(), so they can't diverge.
 * This guards: (a) the strip flips turn/idle the instant predictedTurn goes
 * active, (b) its numbers equal what the desktop turn bar paints for the same
 * state + halfRttMs, (c) with no predictedTurn and no RTT sample it is
 * unchanged from before.
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

function setup({ predictedTurn, halfRttMs = 0, timerValues = { black: 60, white: 60 }, status = 'ongoing' } = {}) {
  document.body.innerHTML = `
    <div id="turn-bar">
      <div id="tb-black"><span id="tb-black-timer"></span></div>
      <div id="turn-label"></div>
      <div id="tb-white"><span id="tb-white-timer"></span></div>
    </div>
    <div id="players-strip"></div>
  `;

  window.t = (key) => key;
  window.EscapeUtils = require('../js/escape-utils.js');
  window.RoomClient = { on() { return this; }, emit() {}, emitAck() {} };

  window.RoomState = {
    myUser:   { userId: 'me', displayName: 'Me' },
    myRole:   'player',
    mySlot:   1,
    boardRenderer: null,
    timerValues,
    halfRttMs,
    predictedTurn: predictedTurn || { active: false, forColor: null, snapshotTimerValues: null, switchedAtLocalTs: null },
    roomData: {
      roomId: 'r1',
      state: 'playing',
      settings: { timerSeconds: 60 },
      users: [
        { userId: 'me',   displayName: 'Me',  slot: 1, role: 'player', presence: 'active' },
        { userId: 'them', displayName: 'Foe', slot: 2, role: 'player', presence: 'active' },
      ],
    },
    gameState: {
      status,
      moveCount: 5,
      currentTurn: 'me',
      swap2: null,
      players: [
        { userId: 'me',   color: 'BLACK' },
        { userId: 'them', color: 'WHITE' },
      ],
    },
  };

  window.eval(I18N_SOURCE);
  window.eval(GAME_UI_SOURCE);
  window.eval(ROOM_UI_SOURCE);
}

const strip = () => document.getElementById('players-strip');
const rowFor = (slot) => strip().querySelector(`[data-strip-slot="${slot}"]`);
const trackFor = (key) => strip().querySelector(`[data-strip-track="${key}"]`);
const timeText = (key) => strip().querySelector(`[data-strip-time="${key}"]`).textContent;

describe('mobile players-strip: predictedTurn overlay (TODO.md #166)', () => {
  test('with no predictedTurn the strip marks the authoritative current turn', () => {
    setup();
    window.RoomUI.renderPlayersStrip();

    // currentTurn === 'me' (BLACK, slot 1)
    expect(rowFor(1).classList.contains('players-strip__slot--turn')).toBe(true);
    expect(trackFor('black').classList.contains('players-strip__track--idle')).toBe(false);
    expect(rowFor(2).classList.contains('players-strip__slot--turn')).toBe(false);
    expect(trackFor('white').classList.contains('players-strip__track--idle')).toBe(true);
  });

  test('predictedTurn.active flips the strip to the opponent immediately, before currentTurn changes', () => {
    setup({
      predictedTurn: {
        active: true, forColor: 'WHITE',
        snapshotTimerValues: { black: 50, white: 40 },
        switchedAtLocalTs: Date.now(),
      },
    });
    window.RoomUI.renderPlayersStrip();

    // gameState.currentTurn is still 'me', but the overlay says WHITE (slot 2)
    expect(rowFor(2).classList.contains('players-strip__slot--turn')).toBe(true);
    expect(trackFor('white').classList.contains('players-strip__track--idle')).toBe(false);
    expect(rowFor(1).classList.contains('players-strip__slot--turn')).toBe(false);
    expect(trackFor('black').classList.contains('players-strip__track--idle')).toBe(true);
  });

  test('updateStripTimers alone (the per-second path) also moves the markers when predictedTurn is active', () => {
    setup();
    window.RoomUI.renderPlayersStrip();
    // strip built while it was still my turn
    expect(rowFor(1).classList.contains('players-strip__slot--turn')).toBe(true);

    // now a move goes in flight — only the tick path runs, no full rebuild
    window.RoomState.predictedTurn = {
      active: true, forColor: 'WHITE',
      snapshotTimerValues: { black: 50, white: 40 },
      switchedAtLocalTs: Date.now(),
    };
    window.RoomUI.updateStripTimers();

    expect(rowFor(1).classList.contains('players-strip__slot--turn')).toBe(false);
    expect(rowFor(2).classList.contains('players-strip__slot--turn')).toBe(true);
    expect(trackFor('black').classList.contains('players-strip__track--idle')).toBe(true);
    expect(trackFor('white').classList.contains('players-strip__track--idle')).toBe(false);
  });
});

describe('mobile players-strip: numbers match the desktop turn bar (TODO.md #166)', () => {
  test('idle clock, halfRttMs 0 — strip value equals timerValues, unchanged from before the fix', () => {
    setup({ timerValues: { black: 37, white: 52 }, halfRttMs: 0 });
    window.RoomUI.renderPlayersStrip();

    expect(timeText('black')).toBe('0:37');
    expect(timeText('white')).toBe('0:52');
  });

  test('predictedTurn frozen/counting-down snapshot — strip is driven by the same shared value as the turn bar', () => {
    setup({
      timerValues: { black: 99, white: 99 }, // stale live values the overlay must ignore
      predictedTurn: {
        active: true, forColor: 'WHITE',
        snapshotTimerValues: { black: 45, white: 30 },
        switchedAtLocalTs: Date.now() - 3000, // 3s into the in-flight window
      },
    });

    // The one shared source both surfaces read: BLACK frozen at the snapshot,
    // WHITE counting down from it.
    const vals = window.GameUI.effectiveTimerValues();
    expect(vals.black).toBe(45);
    expect(vals.white).toBeGreaterThan(26);
    expect(vals.white).toBeLessThan(28);

    window.RoomUI.renderPlayersStrip();
    // strip formats M:SS with Math.floor (formatStripTime), so it shows the
    // floor of that same shared value — not the stale live 99.
    expect(timeText('black')).toBe('0:45');
    expect(timeText('white')).toBe(`0:${String(Math.floor(vals.white)).padStart(2, '0')}`);
  });

  test('a finished game leaves neither row marked as the active turn', () => {
    setup({ status: 'finished' });
    window.RoomUI.renderPlayersStrip();

    expect(rowFor(1).classList.contains('players-strip__slot--turn')).toBe(false);
    expect(rowFor(2).classList.contains('players-strip__slot--turn')).toBe(false);
  });
});
