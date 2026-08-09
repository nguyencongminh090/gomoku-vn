/**
 * TODO.md #88 / docs/fix-log/2026-08-09-todo-88-tournament-match-spectator-leave-lock.md
 *
 * client/js/tournament-match.js's `setLeaveLocked` disables the sole "leave
 * this match" link (#back-to-tournament) while a tournament pairing is
 * undecided, to stop a PLAYER wandering off mid-series. The bug: it was
 * applied to every socket in the match room, so spectators/guests watching
 * got locked out exactly like the two real players.
 *
 * client/js/ has no test runner wired to `npm test` for the rest of the repo
 * (see CLAUDE.md's "Bug-fix workflow" note) — this is the first client/js
 * unit test, using jest-environment-jsdom (added as a devDependency for this
 * fix) with the real tournament-match.html body as its DOM fixture, so the
 * `document.getElementById(...)` calls tournament-match.js makes at module
 * load run against production markup rather than a hand-rolled stand-in that
 * could silently drift from it.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/tournament-match.html?tournamentId=t1&pairingId=p1"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'tournament-match.html');
const BODY_HTML = (() => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!match) throw new Error('tournament-match.html: <body> tag not found');
  return match[1];
})();

const PAIRING_ID = 'p1';
const TOURNAMENT_ID = 't1';
const PLAYER1 = { userId: 'u-player-1', displayName: 'Player One', color: 'BLACK' };
const PLAYER2 = { userId: 'u-player-2', displayName: 'Player Two', color: 'WHITE' };

let lastSocketClient;

function basePayload(overrides = {}) {
  return {
    tournamentId: TOURNAMENT_ID,
    pairingId: PAIRING_ID,
    status: 'ongoing',
    boardSize: 15,
    board: [],
    moveCount: 0,
    moveHistory: [],
    walls: [],
    portals: [],
    firstMoveZones: [],
    currentTurn: PLAYER1.userId,
    result: null,
    swap2: { enabled: false },
    players: [PLAYER1, PLAYER2],
    timer: null,
    timerSync: null,
    series: null,
    ...overrides,
  };
}

// Sets up a fresh DOM (from the real page markup) and every global
// tournament-match.js reaches for at module load, as the signed-in identity
// `sessionUserId` — or `null` for a not-signed-in viewer, matched against
// `window.GvnSession.getUser()` returning null.
function setupPage(sessionUserId) {
  document.body.innerHTML = BODY_HTML;

  window.GvnSession = {
    requireAuth: jest.fn(),
    getUser: jest.fn(() => (sessionUserId ? { userId: sessionUserId, displayName: 'Test User', isGuest: false } : null)),
  };
  window.t = jest.fn((key) => key);
  window.requestAnimationFrame = jest.fn();
  window.BoardRenderer = class {
    setState() {}
    resize() {}
  };

  lastSocketClient = null;
  window.SocketClient = class {
    constructor() {
      this._handlers = {};
      lastSocketClient = this;
    }
    emit() {}
    on(event, cb) {
      (this._handlers[event] = this._handlers[event] || []).push(cb);
    }
    bindStatusBanner() {}
    trigger(event, payload) {
      (this._handlers[event] || []).forEach((cb) => cb(payload));
    }
  };
}

function loadTournamentMatchModule() {
  jest.resetModules();
  require('../js/tournament-match.js');
}

function backLink() {
  return document.getElementById('back-to-tournament');
}

function isLocked() {
  const el = backLink();
  return el.classList.contains('detail-back--disabled') && el.getAttribute('aria-disabled') === 'true';
}

describe('tournament-match.js leave-lock (TODO.md #88)', () => {
  test('at page load, before tmatch:init arrives, the leave link starts unlocked', () => {
    setupPage(PLAYER1.userId);
    loadTournamentMatchModule();

    expect(isLocked()).toBe(false);
  });

  test('tmatch:init locks the leave link for an actual player of the pairing', () => {
    setupPage(PLAYER1.userId);
    loadTournamentMatchModule();

    lastSocketClient.trigger('tmatch:init', basePayload());

    expect(isLocked()).toBe(true);
  });

  test('tmatch:init never locks the leave link for a spectator (signed-in, not a player)', () => {
    setupPage('u-spectator-1');
    loadTournamentMatchModule();

    lastSocketClient.trigger('tmatch:init', basePayload());

    expect(isLocked()).toBe(false);
  });

  test('tmatch:init never locks the leave link for a guest spectator', () => {
    // Guests get their own userId from the session same as registered users
    // (see userInfo.isGuest in tournament-match.js) — myPlayer() only cares
    // whether that id matches one of the pairing's two players, not guest
    // status, so a guest id is exercised as its own case rather than assumed
    // to behave like the registered-spectator case above.
    setupPage('guest-abc123');
    loadTournamentMatchModule();

    lastSocketClient.trigger('tmatch:init', basePayload());

    expect(isLocked()).toBe(false);
  });

  test('mid-series transition (showSeriesTransition) locks again for a player, not a spectator', () => {
    setupPage(PLAYER2.userId);
    loadTournamentMatchModule();

    // First game of the series just started.
    lastSocketClient.trigger('tmatch:init', basePayload({ series: { seriesMode: 'bestOf', gameIndex: 0 } }));
    expect(isLocked()).toBe(true);

    // That game ends, series not yet decided -> showSeriesTransition() path
    // (tmatch:ended with series.seriesComplete === false), which re-locks.
    lastSocketClient.trigger('tmatch:ended', {
      pairingId: PAIRING_ID,
      result: { winner: PLAYER2.userId, reason: 'five_in_a_row' },
      series: { seriesComplete: false, scores: [{ displayName: PLAYER1.displayName, score: 0 }, { displayName: PLAYER2.displayName, score: 1 }] },
    });

    expect(isLocked()).toBe(true);
  });

  test('mid-series transition never locks a spectator', () => {
    setupPage('u-spectator-2');
    loadTournamentMatchModule();

    lastSocketClient.trigger('tmatch:init', basePayload({ series: { seriesMode: 'bestOf', gameIndex: 0 } }));
    expect(isLocked()).toBe(false);

    lastSocketClient.trigger('tmatch:ended', {
      pairingId: PAIRING_ID,
      result: { winner: PLAYER1.userId, reason: 'five_in_a_row' },
      series: { seriesComplete: false, scores: [{ displayName: PLAYER1.displayName, score: 1 }, { displayName: PLAYER2.displayName, score: 0 }] },
    });

    expect(isLocked()).toBe(false);
  });

  test('pairing decided (showResultOverlay) unlocks the leave link for a player', () => {
    setupPage(PLAYER1.userId);
    loadTournamentMatchModule();

    lastSocketClient.trigger('tmatch:init', basePayload());
    expect(isLocked()).toBe(true);

    lastSocketClient.trigger('tmatch:ended', {
      pairingId: PAIRING_ID,
      result: { winner: PLAYER1.userId, reason: 'five_in_a_row' },
      series: null,
    });

    expect(isLocked()).toBe(false);
  });
});
