/**
 * #216 — quick-match rooms play exactly one game: no Start modal, each page
 * readies itself once both seats are filled; manual rooms keep the modal.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/room.html?id=%23ABC"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
const BODY_HTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];

function load({ matchmade, state = 'idle', isReady = false, matchGameSeen = false, matchGames = 0, matchMax = 3, readyDeadline = null }) {
  jest.resetModules();
  document.body.innerHTML = BODY_HTML;
  window.t = jest.fn((k, v) => (v ? `${k} ${JSON.stringify(v)}` : k));
  window.EscapeUtils = require('../js/escape-utils.js');
  const emit = jest.fn();
  window.RoomClient = { emit };
  window.RoomState = {
    mySlot: 1, isReady, matchGameSeen, myRole: 'player',
    myUser: { userId: 'me', displayName: 'Me' },
    roomData: {
      state, matchmade, matchGames, matchMax, readyDeadline,
      users: [
        { userId: 'me', displayName: 'Me', slot: 1, role: 'player', presence: 'active' },
        { userId: 'opp', displayName: 'Opp', slot: 2, role: 'player', presence: 'active' },
      ],
    },
  };
  require('../js/room-ui.js');
  window.RoomUI.renderStartModal();
  return { emit, modal: document.getElementById('start-modal') };
}

describe('room-ui.js renderStartModal(): matchmade rooms', () => {
  test('matchmade, both seated, idle → no modal, auto room:ready', () => {
    const { emit, modal } = load({ matchmade: true });
    expect(modal.classList.contains('visible')).toBe(false);
    expect(emit).toHaveBeenCalledWith('room:ready');
  });

  test('matchmade, already ready → no second room:ready', () => {
    const { emit } = load({ matchmade: true, isReady: true });
    expect(emit).not.toHaveBeenCalled();
  });

  test('matchmade, game finished → no auto-ready; #365 post-game modal instead', () => {
    const { emit, modal } = load({ matchmade: true, matchGameSeen: true, matchGames: 1 });
    expect(emit).not.toHaveBeenCalled();
    expect(modal.classList.contains('visible')).toBe(true);
  });

  test('matchmade, state playing marks the game as seen', () => {
    load({ matchmade: true, state: 'playing' });
    expect(window.RoomState.matchGameSeen).toBe(true);
  });

  test('manual room keeps the modal and does not auto-ready', () => {
    const { emit, modal } = load({ matchmade: false });
    expect(modal.classList.contains('visible')).toBe(true);
    expect(emit).not.toHaveBeenCalled();
  });
});

// #365: after each quick-match game: "Chơi tiếp (ván n/max)" + "Về trang chủ", countdown from the server.
describe('#365 quick-match post-game modal', () => {
  const shown = (id) => document.getElementById(id).style.display !== 'none';

  test('game 1 of 3 done: play-again (game 2/3) + home, server countdown', () => {
    const { modal } = load({ matchmade: true, matchGames: 1, readyDeadline: Date.now() + 15000 });
    expect(modal.classList.contains('visible')).toBe(true);
    expect(document.getElementById('start-modal-title').textContent).toBe('match_end.title {"n":1,"max":3}');
    expect(document.getElementById('start-modal-btn').textContent).toBe('match_end.again {"n":2,"max":3}');
    expect(shown('start-modal-btn')).toBe(true);
    expect(shown('start-modal-home')).toBe(true);
    expect(shown('start-modal-countdown-wrap')).toBe(true);
    expect(Number(document.getElementById('start-modal-countdown').textContent)).toBeGreaterThanOrEqual(14);
  });

  test('a reload between games (no matchGameSeen) neither auto-readies nor hides the modal', () => {
    const { emit, modal } = load({ matchmade: true, matchGames: 2 });
    expect(emit).not.toHaveBeenCalled();
    expect(modal.classList.contains('visible')).toBe(true);
  });

  test('after "Chơi tiếp": button hidden, waiting line shown, home still offered', () => {
    load({ matchmade: true, matchGames: 1, isReady: true });
    expect(shown('start-modal-btn')).toBe(false);
    expect(shown('start-modal-waiting')).toBe(true);
    expect(shown('start-modal-home')).toBe(true);
  });

  test('3 of 3 played: only "Về trang chủ"', () => {
    load({ matchmade: true, matchGames: 3 });
    expect(document.getElementById('start-modal-title').textContent).toBe('match_end.done_title {"max":3}');
    expect(shown('start-modal-btn')).toBe(false);
    expect(shown('start-modal-waiting')).toBe(false);
    expect(shown('start-modal-home')).toBe(true);
  });

  test('"Về trang chủ" emits room:leave', () => {
    const { emit } = load({ matchmade: true, matchGames: 1 });
    expect(document.getElementById('start-modal-home').dataset.action).toBe('leaveMatch');
    window.leaveMatch();
    expect(emit).toHaveBeenCalledWith('room:leave');
  });

  test('during a game the modal stays hidden', () => {
    const { modal } = load({ matchmade: true, matchGames: 1, state: 'playing' });
    expect(modal.classList.contains('visible')).toBe(false);
  });
});

describe('#365 seat lock in the UI', () => {
  test('quick match: no stand-up button on my card', () => {
    load({ matchmade: true, matchGames: 1 });
    window.RoomUI.renderPlayerCards();
    expect(document.querySelector('[data-action="standUp"]')).toBeNull();
  });
  test('manual room keeps the stand-up button', () => {
    load({ matchmade: false });
    window.RoomUI.renderPlayerCards();
    expect(document.querySelector('[data-action="standUp"]')).not.toBeNull();
  });
});
