/**
 * B428 / #427 — the tournament match page learns the players' colours when an opening (Swap2 or a
 * Renju Taraguchi-10 / Yamaguchi) ends: tmatch:swap2_state now carries `players`, and the done state
 * switches to the normal board render (interactive for players, Renju forbidden marks for Black).
 * Before: colours stayed null all game, so the board stayed non-interactive after the opening.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/tournament-match.html?tournamentId=t1&pairingId=p1"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BODY_HTML = fs.readFileSync(path.join(__dirname, '..', 'tournament-match.html'), 'utf8').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
const RENJU_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'renju.js'), 'utf8');
const RX_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'renju-opening-ui.js'), 'utf8');

let client;
let states;

function setup(userId) {
  document.body.innerHTML = BODY_HTML;
  window.GvnSession = { requireAuth: jest.fn(), getUser: () => ({ userId, displayName: 'T', isGuest: false }) };
  window.t = (key) => key;
  window.requestAnimationFrame = jest.fn();
  states = [];
  window.BoardRenderer = class { setState(s) { states.push(s); } resize() {} };
  window.SocketClient = class {
    constructor() { this._h = {}; client = this; }
    emit() {}
    on(e, cb) { (this._h[e] = this._h[e] || []).push(cb); }
    bindStatusBanner() {}
    trigger(e, p) { (this._h[e] || []).forEach((cb) => cb(p)); }
  };
  window.eval(RENJU_SRC);
  window.eval(RX_SRC);
  jest.resetModules();
  require('../js/tournament-match.js');
}

const empty = () => Array.from({ length: 15 }, () => Array(15).fill(0));
const swap2Open = { enabled: true, rule: 'yamaguchi', openingPhase: 'rx_pick', step: 'pick', firstPlayerId: 'u1', secondPlayerId: 'u2',
  colorsAssigned: false, tentativeBlackId: 'u1', offers: [{ x: 3, y: 3 }], offerN: 1 };

function init() {
  client.trigger('tmatch:init', {
    tournamentId: 't1', pairingId: 'p1', status: 'ongoing', boardSize: 15, board: empty(), moveCount: 4, moveHistory: [],
    walls: [], portals: [], firstMoveZones: [], currentTurn: 'u2', result: null, winningRule: 'renju',
    swap2: swap2Open,
    players: [{ userId: 'u1', displayName: 'A', color: null }, { userId: 'u2', displayName: 'B', color: null }],
    timer: null, timerSync: null, series: null,
  });
}

test('mid-opening init draws the opening step (offers) over the board', () => {
  setup('u2');
  init();
  expect(states[states.length - 1]).toMatchObject({ offers: [{ x: 3, y: 3 }], interactive: true });
});

test('the done swap2_state carries colours; the board becomes the normal interactive play board', () => {
  setup('u2');
  init();
  const board = empty(); board[3][3] = 1;
  client.trigger('tmatch:swap2_state', {
    tournamentId: 't1', pairingId: 'p1', board, moveCount: 5, moveHistory: [{ x: 3, y: 3, color: 'BLACK' }], currentTurn: 'u2',
    openingPhase: 'play', swap2: { ...swap2Open, openingPhase: 'play', step: null, offers: [], colorsAssigned: true },
    players: [{ userId: 'u1', displayName: 'A', color: 'BLACK' }, { userId: 'u2', displayName: 'B', color: 'WHITE' }],
    lastStone: { x: 3, y: 3, color: 'BLACK' }, nextColor: null,
  });
  const s = states[states.length - 1];
  expect(s.myColor).toBe('WHITE');
  expect(s.interactive).toBe(true);
  expect(s.isMyTurn).toBe(true);
  expect(s.offers).toEqual([]);
});

test('Black gets Renju forbidden marks once colours arrive', () => {
  setup('u1');
  init();
  // A double-three point for Black at (7,7): B at (5,7),(6,7) and (7,5),(7,6).
  const board = empty();
  for (const [x, y] of [[5, 7], [6, 7], [7, 5], [7, 6]]) board[y][x] = 1;
  for (const [x, y] of [[0, 0], [0, 2], [0, 4], [0, 6]]) board[y][x] = 2;
  client.trigger('tmatch:swap2_state', {
    tournamentId: 't1', pairingId: 'p1', board, moveCount: 8, moveHistory: [], currentTurn: 'u1',
    openingPhase: 'play', swap2: { ...swap2Open, openingPhase: 'play', step: null, offers: [], colorsAssigned: true },
    players: [{ userId: 'u1', displayName: 'A', color: 'BLACK' }, { userId: 'u2', displayName: 'B', color: 'WHITE' }],
    lastStone: null, nextColor: null,
  });
  expect(states[states.length - 1].forbidden).toContainEqual({ x: 7, y: 7 });
});
