/**
 * TODO.md #191 item 6
 *
 * room.html's top bar carries the site links (#room-site-links). Each one
 * navigates away from the room, so room-ui.js's updateUI() hides the row while
 * the viewer holds a seat in an ongoing game (same condition as the Rời phòng
 * confirm in room.js), and shows it otherwise.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/room.html?id=%23ABC"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
const BODY_HTML = HTML.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];

function render({ slot, status }) {
  document.body.innerHTML = BODY_HTML;
  window.t = jest.fn((key) => key);
  jest.resetModules();
  window.EscapeUtils = require('../js/escape-utils.js');
  window.GameUI = { initBoard: jest.fn() };
  window.RoomState = {
    roomData: {
      roomId: '#ABC',
      state: status === 'ongoing' ? 'playing' : 'waiting',
      settings: { winningRule: 'freestyle', timerMode: 'none', timerSeconds: 60 },
      scoreTable: {},
      users: [{ userId: 'me', displayName: 'Me', slot, role: slot === null ? 'guest' : 'player', ready: true, presence: 'active' }],
    },
    gameState: status ? { status, players: [{ userId: 'me', color: 'BLACK' }] } : null,
    timerValues: { black: 60, white: 60 },
    myUser: { userId: 'me', displayName: 'Me' },
  };
  require('../js/room-ui.js');
  window.RoomUI.updateUI();
  return document.getElementById('room-site-links');
}

describe('room top bar site links (#191 item 6)', () => {
  test('the row links to the site pages', () => {
    const nav = render({ slot: null, status: null });
    const hrefs = [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/index.html', '/index.html#rooms', '/index.html#tournaments', '/rankings.html', '/clubs.html', '/puzzles']);
  });

  test.each([
    ['seated, game ongoing', 1, 'ongoing', true],
    ['seated in slot 2, game ongoing', 2, 'ongoing', true],
    ['seated, no game yet', 1, null, false],
    ['seated, game finished', 1, 'finished', false],
    ['spectator, game ongoing', null, 'ongoing', false],
    ['spectator, no game', null, null, false],
  ])('%s', (_label, slot, status, hidden) => {
    expect(render({ slot, status }).hidden).toBe(hidden);
  });

  test('reappears once the game ends', () => {
    const nav = render({ slot: 1, status: 'ongoing' });
    expect(nav.hidden).toBe(true);
    window.RoomState.gameState.status = 'finished';
    window.RoomUI.updateUI();
    expect(nav.hidden).toBe(false);
  });
});
