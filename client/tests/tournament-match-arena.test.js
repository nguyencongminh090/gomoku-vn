/**
 * Match page in room.html's layout: seat cards (me at the bottom, turn marker, clocks), series score card,
 * move lists and the draw toast.
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

describe('tournament match arena rendering', () => {
  const $ = (id) => document.getElementById(id);
  const sync = { black: 65, white: 9, activeColor: 'black', deadline: null, running: false, serverTime: Date.now() };

  test('seat cards: me at the bottom with my clock, turn and low-time marks', () => {
    setupPage(PLAYER2.userId);
    loadTournamentMatchModule();
    lastSocketClient.trigger('tmatch:init', basePayload({ timerSync: sync }));

    expect($('seatcard-bottom').textContent).toContain('Player Two');
    expect($('seatcard-top').textContent).toContain('Player One');
    expect($('seatcard-top').querySelector('[data-clock-text]').textContent).toBe('1:05');
    expect($('seatcard-top').classList.contains('seatcard--turn')).toBe(true);
    expect($('seatcard-bottom').classList.contains('seatcard--low')).toBe(true);
    expect($('scorecard').hidden).toBe(true);
  });

  test('a series shows the score card', () => {
    setupPage(PLAYER1.userId);
    loadTournamentMatchModule();
    lastSocketClient.trigger('tmatch:init', basePayload({
      series: { seriesMode: 'fixedCount', gameIndex: 1, seriesGameCount: 3, scores: [{ displayName: 'Player One', score: 1 }, { displayName: 'Player Two', score: 0 }] },
    }));

    expect($('scorecard').hidden).toBe(false);
    expect($('score-hero').querySelector('.score-hero__num').textContent).toBe('1 – 0');
  });

  test('phones: the series score moves into the third tab, labelled as score', () => {
    window.matchMedia = () => ({ matches: true, addEventListener() {} });
    setupPage(PLAYER1.userId);
    loadTournamentMatchModule();
    lastSocketClient.trigger('tmatch:init', basePayload({
      series: { seriesMode: 'fixedCount', gameIndex: 0, seriesGameCount: 2, scores: null },
    }));

    expect($('tab-users').querySelector('#score-hero .score-hero__num').textContent).toBe('0 – 0');
    expect(document.querySelector('.tab-btn[data-tab="tab-users"] .tab-btn__label').textContent).toBe('room.tab_scores');
    delete window.matchMedia;
  });

  test('moves fill both lists and an opponent draw offer is a toast with accept/decline', () => {
    setupPage(PLAYER2.userId);
    loadTournamentMatchModule();
    lastSocketClient.trigger('tmatch:init', basePayload());
    lastSocketClient.trigger('tmatch:moved', { pairingId: PAIRING_ID, x: 7, y: 7, color: 'BLACK', nextTurn: PLAYER2.userId, moveCount: 1 });
    lastSocketClient.trigger('tmatch:draw_offered', { pairingId: PAIRING_ID, from: PLAYER1.userId, fromName: 'Player One' });

    expect($('moves-list').querySelectorAll('li')).toHaveLength(1);
    expect($('moves-grid').querySelectorAll('li')).toHaveLength(1);
    expect($('draw-prompt-area').querySelector('.gtoast #draw-accept-btn')).not.toBeNull();
    expect($('draw-prompt-area').querySelector('#draw-decline-btn')).not.toBeNull();
  });
});
