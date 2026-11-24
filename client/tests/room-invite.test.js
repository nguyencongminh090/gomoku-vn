/**
 * F443 — host invites an online player from the ≡ menu: menu item (host-only), picker dialog, send states.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/room.html?id=%23ABC"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
const BODY_HTML = HTML.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
const $ = (id) => document.getElementById(id);
const flush = () => new Promise((r) => setTimeout(r, 0));
const reply = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const PLAYERS = [
  { userId: 'b', username: 'bob', displayName: 'Bob', avatarUrl: null },
  { userId: 'c', username: 'cat', displayName: '<b>Cat</b>', avatarUrl: null },
];
let calls;

function render({ role = 'host', isGuest = false, players = PLAYERS, post = () => reply(201, { id: 'i1' }) } = {}) {
  document.body.innerHTML = BODY_HTML;
  window.t = jest.fn((key) => key);
  window.showToast = jest.fn();
  jest.resetModules();
  window.EscapeUtils = require('../js/escape-utils.js');
  window.GameUI = { initBoard: jest.fn() };
  calls = [];
  global.fetch = jest.fn((url, init = {}) => {
    calls.push([init.method || 'GET', url, init.body]);
    return init.method === 'POST' ? post(url, init) : reply(200, { players });
  });
  const state = {
    roomData: { roomId: '#ABC', state: 'waiting', settings: { winningRule: 'freestyle', timerMode: 'none', timerSeconds: 60, ranked: false }, scoreTable: {},
      users: [{ userId: 'me', displayName: 'Me', slot: null, role, ready: false, presence: 'active' }] },
    gameState: null, timerValues: { black: 60, white: 60 }, myUser: { userId: 'me', displayName: 'Me', isGuest },
  };
  window.RoomState = state;
  require('../js/room-invite.js');
  require('../js/room-ui.js');
  window.RoomUI.updateUI();
}
const dialog = () => document.querySelector('.rinv');
const rows = () => [...document.querySelectorAll('.rinv__row')];
const open = async () => { $('btn-room-invite-player').click(); await flush(); };

describe('menu item', () => {
  it('sits right under "Chép link mời" in the ≡ menu', () => {
    render();
    expect($('btn-room-invite').nextElementSibling).toBe($('btn-room-invite-player'));
    expect($('room-menu').contains($('btn-room-invite-player'))).toBe(true);
  });

  it('is shown to the host only; guests never; host transfer flips it on the next updateUI', () => {
    render({ role: 'host' });
    expect($('btn-room-invite-player').hidden).toBe(false);
    render({ role: 'player' });
    expect($('btn-room-invite-player').hidden).toBe(true);
    render({ role: 'host', isGuest: true });
    expect($('btn-room-invite-player').hidden).toBe(true);
    render({ role: 'guest' });
    window.RoomState.roomData.users[0].role = 'host';
    window.RoomUI.updateUI();
    expect($('btn-room-invite-player').hidden).toBe(false);
    window.RoomState.roomData.users[0].role = 'guest';
    window.RoomUI.updateUI();
    expect($('btn-room-invite-player').hidden).toBe(true);
  });
});

describe('picker dialog', () => {
  it('opens on click, loads GET /api/room-invites/online, lists names as text, says invitees join as spectators', async () => {
    render();
    await open();
    expect(dialog().getAttribute('role')).toBe('dialog');
    expect(dialog().getAttribute('aria-modal')).toBe('true');
    expect(calls[0]).toEqual(['GET', '/api/room-invites/online', undefined]);
    expect(rows().map((r) => r.querySelector('.rinv__dn').textContent)).toEqual(['Bob', '<b>Cat</b>']);
    expect(dialog().querySelector('b')).toBeNull();
    expect(dialog().textContent).toContain('room.invite_hint');
    expect(document.activeElement).toBe(dialog().querySelector('input[type="search"]'));
  });

  it('search filters by name or username, case-insensitively; no match → message', async () => {
    render();
    await open();
    const q = dialog().querySelector('input[type="search"]');
    q.value = 'BO';
    q.dispatchEvent(new Event('input'));
    expect(rows().map((r) => r.querySelector('.rinv__un').textContent)).toEqual(['@bob']);
    q.value = 'zzz';
    q.dispatchEvent(new Event('input'));
    expect(rows()).toHaveLength(0);
    expect(dialog().querySelector('[role="status"]').textContent).toBe('room.invite_no_match');
  });

  it('nobody online → "none" message', async () => {
    render({ players: [] });
    await open();
    expect(rows()).toHaveLength(0);
    expect(dialog().querySelector('[role="status"]').textContent).toBe('room.invite_none');
  });

  it('Invite POSTs {to, roomId}, then the row shows "invited" and is disabled', async () => {
    render();
    await open();
    rows()[0].querySelector('button').click();
    expect(rows()[0].querySelector('button').disabled).toBe(true); // locked while in flight
    await flush();
    expect(calls).toContainEqual(['POST', '/api/room-invites', JSON.stringify({ to: 'bob', roomId: '#ABC' })]);
    const b = rows()[0].querySelector('button');
    expect([b.textContent, b.disabled]).toEqual(['room.invite_sent', true]);
    expect(rows()[1].querySelector('button').disabled).toBe(false);
  });

  it('a refused invite shows the server message and the button works again', async () => {
    render({ post: () => reply(409, { error: 'Người này đang ở trong một phòng.', code: 'TARGET_IN_ROOM' }) });
    await open();
    rows()[0].querySelector('button').click();
    await flush();
    expect(dialog().querySelector('[role="status"]').textContent).toBe('Người này đang ở trong một phòng.');
    expect(rows()[0].querySelector('button').disabled).toBe(false);
  });

  it('a failed list load shows the generic error', async () => {
    render();
    global.fetch = jest.fn(() => Promise.reject(new Error('offline')));
    await open();
    expect(dialog().querySelector('[role="status"]').textContent).toBe('room.invite_error');
  });

  it('closes on Escape, on the × button and on the overlay; one dialog at a time', async () => {
    render();
    await open();
    await open();
    expect(document.querySelectorAll('.rinv')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(dialog()).toBeNull();
    await open();
    dialog().querySelector('.rinv__x').click();
    expect(dialog()).toBeNull();
    await open();
    dialog().parentElement.click(); // the overlay itself (room.html has other .modal-overlay nodes)
    expect(dialog()).toBeNull();
  });
});
