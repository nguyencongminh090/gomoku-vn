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

function load({ matchmade, state = 'idle', isReady = false, matchGameSeen = false }) {
  jest.resetModules();
  document.body.innerHTML = BODY_HTML;
  window.t = jest.fn((k) => k);
  window.EscapeUtils = require('../js/escape-utils.js');
  const emit = jest.fn();
  window.RoomClient = { emit };
  window.RoomState = {
    mySlot: 1, isReady, matchGameSeen, myRole: 'player',
    myUser: { userId: 'me', displayName: 'Me' },
    roomData: {
      state, matchmade,
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

  test('matchmade, game finished (idle after playing) → no rematch ready, no modal', () => {
    const { emit, modal } = load({ matchmade: true, matchGameSeen: true });
    expect(emit).not.toHaveBeenCalled();
    expect(modal.classList.contains('visible')).toBe(false);
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

describe('leave button after the single matchmade game', () => {
  test('is highlighted once the game was seen and the room is idle', () => {
    load({ matchmade: true, matchGameSeen: true });
    expect(document.getElementById('btn-leave').classList.contains('is-cta')).toBe(true);
  });
  test('not highlighted before the game or in manual rooms', () => {
    load({ matchmade: true });
    expect(document.getElementById('btn-leave').classList.contains('is-cta')).toBe(false);
    load({ matchmade: false, matchGameSeen: true });
    expect(document.getElementById('btn-leave').classList.contains('is-cta')).toBe(false);
  });
});

describe('RoomUI.installOutsideTapBlur (mobile keyboard)', () => {
  function tap(target, pointerType = 'touch') {
    const ev = new Event('pointerdown', { bubbles: true });
    ev.pointerType = pointerType;
    target.dispatchEvent(ev);
  }
  beforeEach(() => {
    load({ matchmade: false });
    document.getElementById('chat-input').focus(); // room-ui.js installs the listener on load
  });
  test('touch on the board area blurs the chat input', () => {
    tap(document.getElementById('start-modal'));
    expect(document.activeElement).not.toBe(document.getElementById('chat-input'));
  });
  test('touch on the send button keeps focus', () => {
    tap(document.getElementById('btn-send'));
    expect(document.activeElement).toBe(document.getElementById('chat-input'));
  });
  test('mouse click does not blur', () => {
    tap(document.getElementById('start-modal'), 'mouse');
    expect(document.activeElement).toBe(document.getElementById('chat-input'));
  });
});

describe('RoomUI.trackBoardHeight (mobile sticky stack)', () => {
  test('writes the board shell height to --board-h', () => {
    load({ matchmade: false });
    const shell = document.getElementById('board-area-shell');
    shell.getBoundingClientRect = () => ({ height: 390 });
    window.ResizeObserver = class { observe() {} };
    window.RoomUI.trackBoardHeight(document);
    expect(document.documentElement.style.getPropertyValue('--board-h')).toBe('390px');
  });
});

describe('matchmade auto-ready is not re-emitted while the ack is in flight', () => {
  test('two renders in a row → one room:ready', () => {
    const { emit } = load({ matchmade: true });
    window.RoomUI.renderStartModal();
    window.RoomUI.renderStartModal();
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
