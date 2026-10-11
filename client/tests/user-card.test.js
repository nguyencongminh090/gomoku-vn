/**
 * B220 — clicking an online name opens a profile card (friend + message) instead of a chat window.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'private-chat.js'), 'utf8')
  .replace(/^import .*$/m, 'const client = window.__client;');

const flush = () => new Promise((r) => setTimeout(r, 0));
const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const CARD = { userId: 'u2', username: 'bob', displayName: 'Bob', avatarUrl: null, friendship: 'none', isSelf: false,
  can: { dm: true, friend: true }, ratings: [{ category: 'freestyle', rating: 1500, rank: 7, provisional: false }], stats: { games: 10, wins: 4 } };

function boot({ user = { userId: 'me', displayName: 'Me', isGuest: false }, fetchImpl }) {
  document.body.innerHTML = '<div id="online-line-names"><span data-user-id="u2" class="online-name">Bob</span></div>'
    + '<div id="private-chat-container"></div><div id="modal-online-users"><ul id="online-users-list"></ul><input id="online-users-search"></div>';
  window.__client = { on: jest.fn(), emit: jest.fn() };
  window.GvnSession = { getUser: () => user };
  window.EscapeUtils = require('../js/escape-utils.js');
  window.t = (k) => k;
  global.fetch = jest.fn(fetchImpl);
  window.eval(SRC);
  window.PrivateChat.init();
  window.PrivateChat.updateOnlineUsers([{ userId: 'u2', displayName: 'Bob' }]);
}
const card = () => document.getElementById('modal-user-card');
const btnTexts = () => [...card().querySelectorAll('button')].map((b) => b.textContent);

afterEach(() => { const c = document.getElementById('modal-user-card'); if (c) c.remove(); });

describe('profile card on name click', () => {
  it('opens the card (not a chat window) with name, rating chip and stats', async () => {
    boot({ fetchImpl: () => json(CARD) });
    document.querySelector('[data-user-id="u2"]').click();
    await flush(); await flush();
    expect(card().classList.contains('visible')).toBe(true);
    expect(document.querySelectorAll('.pm-window')).toHaveLength(0);
    expect(card().querySelector('.ucard__name').textContent).toBe('Bob');
    expect(card().querySelector('.ucard__sub').textContent).toBe('@bob');
    expect(card().querySelector('.ucard__chip').textContent).toContain('1500');
    expect(card().textContent).toContain('card.stats');
    expect(btnTexts()).toEqual(expect.arrayContaining(['friends.add', 'dm.btn']));
  });

  it('Message opens the chat window and closes the card', async () => {
    boot({ fetchImpl: (u) => (u.startsWith('/api/profile/card') ? json(CARD) : json({ messages: [] })) });
    document.querySelector('[data-user-id="u2"]').click();
    await flush(); await flush();
    [...card().querySelectorAll('button')].find((b) => b.textContent === 'dm.btn').click();
    expect(card().classList.contains('visible')).toBe(false);
    expect(document.querySelectorAll('.pm-window')).toHaveLength(1);
  });

  it('Add friend POSTs to /api/friends/:username and reloads the card', async () => {
    const calls = [];
    let state = 'none';
    boot({ fetchImpl: (u, o) => {
      calls.push([(o && o.method) || 'GET', u]);
      if (u.startsWith('/api/profile/card')) return json({ ...CARD, friendship: state });
      state = 'outgoing';
      return json({ status: 'outgoing' });
    } });
    document.querySelector('[data-user-id="u2"]').click();
    await flush(); await flush();
    [...card().querySelectorAll('button')].find((b) => b.textContent === 'friends.add').click();
    await flush(); await flush(); await flush();
    expect(calls).toContainEqual(['POST', '/api/friends/bob']);
    expect(btnTexts()).toEqual(expect.arrayContaining(['friends.cancel']));
    expect(btnTexts()).not.toContain('friends.add');
  });

  it.each([
    ['friends', ['friends.remove']],
    ['incoming', ['friends.accept', 'friends.decline']],
  ])('friendship=%s shows %j', async (friendship, expected) => {
    boot({ fetchImpl: () => json({ ...CARD, friendship }) });
    document.querySelector('[data-user-id="u2"]').click();
    await flush(); await flush();
    expect(btnTexts()).toEqual(expect.arrayContaining(expected));
  });

  it('respects server permissions: no DM / no friend requests show notes instead of buttons', async () => {
    boot({ fetchImpl: () => json({ ...CARD, can: { dm: false, friend: false } }) });
    document.querySelector('[data-user-id="u2"]').click();
    await flush(); await flush();
    expect(btnTexts()).not.toContain('dm.btn');
    expect(btnTexts()).not.toContain('friends.add');
    expect(card().textContent).toContain('privacy.no_dm');
    expect(card().textContent).toContain('privacy.no_friend');
  });

  it('guest target (404) falls back to a name-only card that can still chat', async () => {
    boot({ fetchImpl: () => json({}, 404) });
    document.querySelector('[data-user-id="u2"]').click();
    await flush(); await flush();
    expect(card().querySelector('.ucard__name').textContent).toBe('Bob');
    expect(btnTexts()).toContain('dm.btn');
    expect(btnTexts()).not.toContain('friends.add');
  });

  it('a guest viewer gets no friend button', async () => {
    boot({ user: { userId: 'g', displayName: 'G', isGuest: true }, fetchImpl: () => json(CARD) });
    document.querySelector('[data-user-id="u2"]').click();
    await flush(); await flush();
    expect(btnTexts()).not.toContain('friends.add');
  });

  it('names are rendered as text, never HTML', async () => {
    boot({ fetchImpl: () => json({ ...CARD, displayName: '<img src=x onerror=alert(1)>' }) });
    document.querySelector('[data-user-id="u2"]').click();
    await flush(); await flush();
    expect(card().querySelector('img')).toBeNull();
    expect(card().querySelector('.ucard__name').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('closes on the ✕ button and a stale response after close does not reopen it', async () => {
    let release;
    boot({ fetchImpl: () => new Promise((r) => { release = () => r({ ok: true, status: 200, json: () => Promise.resolve(CARD) }); }) });
    document.querySelector('[data-user-id="u2"]').click();
    window.PrivateChat.closeCard();
    release();
    await flush(); await flush();
    expect(card()).toBeNull();
  });
});

describe('desktop-notification permission is asked in context, once', () => {
  const stub = (permission) => {
    const request = jest.fn(() => Promise.resolve('granted'));
    global.Notification = Object.assign(function N() {}, { permission, requestPermission: request });
    window.Notification = global.Notification;
    return request;
  };
  afterEach(() => { delete global.Notification; delete window.Notification; });

  it('asks when Message is clicked and permission is still "default"; no leftover modal button', async () => {
    const request = stub('default');
    boot({ fetchImpl: (u) => (u.startsWith('/api/profile/card') ? json(CARD) : json({ messages: [] })) });
    expect(document.getElementById('btn-notif-enable')).toBeNull();
    expect(request).not.toHaveBeenCalled(); // never on load
    document.querySelector('[data-user-id="u2"]').click();
    await flush(); await flush();
    [...card().querySelectorAll('button')].find((b) => b.textContent === 'dm.btn').click();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(['granted', 'denied'])('never asks again when permission is already %s', async (perm) => {
    const request = stub(perm);
    boot({ fetchImpl: (u) => (u.startsWith('/api/profile/card') ? json(CARD) : json({ messages: [] })) });
    document.querySelector('[data-user-id="u2"]').click();
    await flush(); await flush();
    [...card().querySelectorAll('button')].find((b) => b.textContent === 'dm.btn').click();
    expect(request).not.toHaveBeenCalled();
  });

  it('asks on first send from a chat window', async () => {
    const request = stub('default');
    boot({ fetchImpl: () => json({ messages: [] }) });
    window.PrivateChat.openChat('u2');
    await flush(); await flush();
    const w = document.querySelector('.pm-window');
    w.querySelector('input,textarea').disabled = false;
    w.querySelector('input,textarea').value = 'hi';
    w.querySelector('.pm-send-btn').click();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
