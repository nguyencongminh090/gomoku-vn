/**
 * TODO.md #90 / docs/fix-log/*-todo-90-tournament-match-auto-scroll-on-move.md
 *
 * client/js/tournament-match.js's `updateBoardState()` used to schedule
 * `boardRenderer.resize()` (via requestAnimationFrame) after EVERY move
 * update, unlike the equivalent Tables Room path (game-ui.js's
 * `updateBoardState()`), which only resizes on init/window-resize. resize()
 * writes canvas.width/height/style.width/style.height — a layout-affecting
 * change — so doing it on every move gave the browser's default scroll
 * anchoring something to react to on every click, matching the reported
 * "website auto scroll on board click" bug.
 *
 * This guards the fix: a move update (`tmatch:moved`) must NOT trigger an
 * additional `resize()` call beyond the one already scheduled at board init.
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
const BOARD_SIZE = 15;
const PLAYER1 = { userId: 'u-player-1', displayName: 'Player One', color: 'BLACK' };
const PLAYER2 = { userId: 'u-player-2', displayName: 'Player Two', color: 'WHITE' };

let lastSocketClient;
let lastBoardRenderer;

function emptyBoard(n) {
  return Array.from({ length: n }, () => Array(n).fill(0));
}

function basePayload(overrides = {}) {
  return {
    tournamentId: TOURNAMENT_ID,
    pairingId: PAIRING_ID,
    status: 'ongoing',
    boardSize: BOARD_SIZE,
    board: emptyBoard(BOARD_SIZE),
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

// Same fixture approach as the #88 leave-lock test: real page markup as the
// DOM, minimal stubs for every global tournament-match.js touches at load.
// requestAnimationFrame runs its callback synchronously here (unlike the #88
// test, which leaves it un-invoked) specifically so scheduled resize() calls
// are countable within a single test tick.
function setupPage(sessionUserId) {
  document.body.innerHTML = BODY_HTML;

  window.GvnSession = {
    requireAuth: jest.fn(),
    getUser: jest.fn(() => (sessionUserId ? { userId: sessionUserId, displayName: 'Test User', isGuest: false } : null)),
  };
  window.t = jest.fn((key) => key);
  window.requestAnimationFrame = jest.fn((cb) => cb());

  lastBoardRenderer = null;
  window.BoardRenderer = class {
    constructor() {
      this.setState = jest.fn();
      this.resize = jest.fn();
      lastBoardRenderer = this;
    }
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

describe('tournament-match.js board resize on move (TODO.md #90)', () => {
  test('board init schedules exactly one resize()', () => {
    setupPage(PLAYER1.userId);
    loadTournamentMatchModule();

    lastSocketClient.trigger('tmatch:init', basePayload());

    expect(lastBoardRenderer.resize).toHaveBeenCalledTimes(1);
  });

  test('a move update (tmatch:moved) does not schedule an additional resize()', () => {
    setupPage(PLAYER1.userId);
    loadTournamentMatchModule();

    lastSocketClient.trigger('tmatch:init', basePayload());
    expect(lastBoardRenderer.resize).toHaveBeenCalledTimes(1);

    lastSocketClient.trigger('tmatch:moved', {
      pairingId: PAIRING_ID,
      x: 7, y: 7,
      color: 'BLACK',
      nextTurn: PLAYER2.userId,
      moveCount: 1,
    });

    expect(lastBoardRenderer.resize).toHaveBeenCalledTimes(1);
  });

  test('several consecutive moves still only ever resize once (from init)', () => {
    setupPage(PLAYER2.userId);
    loadTournamentMatchModule();

    lastSocketClient.trigger('tmatch:init', basePayload());
    expect(lastBoardRenderer.resize).toHaveBeenCalledTimes(1);

    const moves = [
      { x: 7, y: 7, color: 'BLACK', nextTurn: PLAYER2.userId, moveCount: 1 },
      { x: 8, y: 7, color: 'WHITE', nextTurn: PLAYER1.userId, moveCount: 2 },
      { x: 7, y: 8, color: 'BLACK', nextTurn: PLAYER2.userId, moveCount: 3 },
    ];
    for (const m of moves) {
      lastSocketClient.trigger('tmatch:moved', { pairingId: PAIRING_ID, ...m });
    }

    expect(lastBoardRenderer.resize).toHaveBeenCalledTimes(1);
    // setState (the actual redraw) DOES still run on every move — only the
    // layout-affecting resize() is what the fix removes from this path.
    expect(lastBoardRenderer.setState.mock.calls.length).toBeGreaterThanOrEqual(moves.length);
  });
});
