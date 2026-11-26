/**
 * #381 — the lobby gets only the first page of the online list (+ the real total). private-chat.js
 * must not treat "not on the page" as "offline": it asks the server (`lobby:online_query`) for chat
 * partners outside the page and for name searches in the online-users modal.
 * Same loading technique as private-chat-history.test.js.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'private-chat.js'), 'utf8')
  .replace(/^import .*$/m, 'const client = window.__client;');

const page = (n) => Array.from({ length: n }, (_, i) => ({ userId: 'p' + i, displayName: 'Page ' + i, isGuest: false }));
let acks;

function boot() {
  jest.useFakeTimers();
  document.body.innerHTML = '<div id="private-chat-container"></div><div id="modal-online-users"><span id="online-users-count"></span>'
    + '<ul id="online-users-list"></ul><input id="online-users-search"></div>';
  acks = [];
  window.__client = { on: jest.fn(), emit: jest.fn(), emitAck: jest.fn((event, data, ms, cb) => acks.push({ event, data, cb })) };
  window.GvnSession = { getUser: () => ({ userId: 'me', displayName: 'Me', isGuest: true }) }; // guest: no history fetch
  window.EscapeUtils = require('../js/escape-utils.js');
  window.t = (k, v) => (v ? k + ' ' + JSON.stringify(v) : k);
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }));
  window.eval(SRC);
  window.PrivateChat.init();
}
afterEach(() => jest.useRealTimers());

const offline = (id) => document.querySelector('.pm-window .is-offline') !== null && !!id;
const rows = () => [...document.querySelectorAll('#online-users-list .online-users-list__name')].map((e) => e.textContent);
const search = (q) => { const el = document.getElementById('online-users-search'); el.value = q; el.dispatchEvent(new Event('input')); };

describe('complete list (total == page): nothing changes', () => {
  it('never queries the server; search filters locally; count = list length', () => {
    boot();
    window.PrivateChat.updateOnlineUsers(page(3), 3);
    window.PrivateChat.openUsersModal();
    search('page 1');
    jest.advanceTimersByTime(60000);
    expect(window.__client.emitAck).not.toHaveBeenCalled();
    expect(rows()).toEqual(['Page 1']);
    expect(document.getElementById('online-users-count').textContent).toBe('3');
    window.PrivateChat.openChat('stranger');
    expect(offline('stranger')).toBe(true); // not in a complete list = offline, as before
    // #497: one id lookup for the partner (a friend's away status is not in the public list); a stranger stays offline.
    expect(window.__client.emitAck).toHaveBeenCalledTimes(1);
    expect(acks[0]).toMatchObject({ event: 'lobby:online_query', data: { ids: ['stranger'] } });
    acks[0].cb(null, { online: [] });
    expect(offline('stranger')).toBe(true);
  });

  it('a call without a total (older caller) means the list is complete', () => {
    boot();
    window.PrivateChat.updateOnlineUsers(page(2));
    window.PrivateChat.openUsersModal();
    expect(document.getElementById('online-users-count').textContent).toBe('2');
  });
});

describe('truncated list (total > page)', () => {
  it('a chat partner outside the page is checked with the server, not shown offline forever', () => {
    boot();
    window.PrivateChat.updateOnlineUsers(page(50), 9000);
    window.PrivateChat.openChat('far');
    expect(acks).toHaveLength(1);
    expect(acks[0]).toMatchObject({ event: 'lobby:online_query', data: { ids: ['far'] } });
    expect(offline('far')).toBe(true); // unknown until the answer
    acks[0].cb(null, { total: 9000, online: ['far'] });
    expect(offline('far')).toBe(false);
    expect(document.querySelector('.pm-window input, .pm-window textarea').disabled).toBe(false);
  });

  it('the server saying "not online", a timeout, or a later user:status offline → offline', () => {
    boot();
    window.PrivateChat.updateOnlineUsers(page(50), 9000);
    window.PrivateChat.openChat('far');
    acks[0].cb(new Error('timeout'));
    expect(offline('far')).toBe(true);
    jest.advanceTimersByTime(20000); // periodic re-check
    expect(acks).toHaveLength(2);
    acks[1].cb(null, { total: 9000, online: ['far'] });
    expect(offline('far')).toBe(false);
    const status = window.__client.on.mock.calls.find((c) => c[0] === 'user:status')[1];
    status({ userId: 'far', status: 'offline' });
    expect(offline('far')).toBe(true);
  });

  it('a partner on the page needs no query', () => {
    boot();
    window.PrivateChat.updateOnlineUsers(page(50), 9000);
    window.PrivateChat.openChat('p7');
    expect(acks).toHaveLength(0);
    expect(offline('p7')).toBe(false);
  });

  it('patches arriving every flush do not turn into a query each (rate limit)', () => {
    boot();
    window.PrivateChat.updateOnlineUsers(page(50), 9000);
    window.PrivateChat.openChat('far');
    for (let i = 0; i < 10; i++) window.PrivateChat.updateOnlineUsers(page(50), 9000 + i);
    expect(acks).toHaveLength(1);
  });

  it('modal: count is the total; a search asks the server (debounced) and shows its answer', () => {
    boot();
    window.PrivateChat.updateOnlineUsers(page(50), 9000);
    window.PrivateChat.openUsersModal();
    expect(document.getElementById('online-users-count').textContent).toBe('9000');
    expect(rows()).toHaveLength(50);
    expect(document.querySelector('.online-users-list__more').textContent).toContain('"n":9000');

    search('mi'); search('min'); search('minh');
    jest.advanceTimersByTime(250);
    const queries = acks.filter((a) => 'q' in a.data);
    expect(queries.map((a) => a.data.q)).toEqual(['minh']); // one request for three keystrokes
    queries[0].cb(null, { total: 9000, matched: 1, users: [{ userId: 'x1', displayName: 'Minh Anh', isGuest: false }] });
    expect(rows()).toEqual(['Minh Anh']);
    expect(document.querySelector('.online-users-list__more')).toBeNull();
  });

  it('modal: an answer for an older query does not replace what is typed now', () => {
    boot();
    window.PrivateChat.updateOnlineUsers(page(50), 9000);
    window.PrivateChat.openUsersModal();
    jest.advanceTimersByTime(250);
    search('page 4');
    jest.advanceTimersByTime(250);
    const [first, second] = acks.filter((a) => 'q' in a.data);
    second.cb(null, { total: 9000, matched: 1, users: [{ userId: 'p4', displayName: 'Page 4', isGuest: false }] });
    first.cb(null, { total: 9000, matched: 9000, users: page(50) }); // late answer for q=''
    expect(rows()).toEqual(['Page 4']);
  });

  it('a chat opened from a search result has the right name and is checked online', () => {
    boot();
    window.PrivateChat.updateOnlineUsers(page(50), 9000);
    window.PrivateChat.openUsersModal();
    search('minh');
    jest.advanceTimersByTime(250);
    acks.find((a) => a.data.q === 'minh').cb(null, { total: 9000, matched: 1, users: [{ userId: 'x1', displayName: 'Minh Anh', isGuest: false }] });
    document.querySelector('.online-users-list__chat-btn').click();
    expect(document.querySelector('.pm-window').textContent).toContain('Minh Anh');
    acks.find((a) => a.data.ids).cb(null, { total: 9000, online: ['x1'] });
    expect(offline('x1')).toBe(false);
  });

  it('back to a complete list: remembered off-page partners are dropped', () => {
    boot();
    window.PrivateChat.updateOnlineUsers(page(50), 9000);
    window.PrivateChat.openChat('far');
    acks[0].cb(null, { total: 9000, online: ['far'] });
    window.PrivateChat.updateOnlineUsers(page(40), 40);
    expect(offline('far')).toBe(true);
  });
});

// #490: the DM window speaks the shared status vocabulary (presence-view) with its dot.
describe('DM window status (#490)', () => {
  it('online partner → presence.online + ok dot; not online → presence.offline + hollow dot', () => {
    boot();
    window.PresenceView = require('../js/presence-view.js');
    window.PrivateChat.updateOnlineUsers(page(2), 2);
    window.PrivateChat.openChat('p1');
    const status = () => document.querySelector('.pm-window__status');
    expect(status().textContent.trim()).toBe('presence.online');
    expect(status().querySelector('.pres-dot').className).toBe('pres-dot pres-dot--ok pres-dot--fill');
    window.PrivateChat.updateOnlineUsers(page(1), 1);
    expect(status().textContent.trim()).toBe('presence.offline');
    expect(status().querySelector('.pres-dot').className).toBe('pres-dot pres-dot--off pres-dot--hollow');
    delete window.PresenceView;
  });
});

// #497: a friend partner's window uses the friend audience from the {ids} answer.
describe('DM window with a friend (#497)', () => {
  it('a friend who is away (not listed) reads "playing, away" instead of offline', () => {
    boot();
    window.PresenceView = require('../js/presence-view.js');
    window.PrivateChat.updateOnlineUsers(page(2), 2);
    window.PrivateChat.openChat('friend1');
    const q = acks.find((x) => x.data && Array.isArray(x.data.ids));
    q.cb(null, { online: [], st: { friend1: { c: 'on', a: 1, k: 'play', r: 'r1' } } });
    const status = document.querySelector('.pm-window__status');
    expect(status.textContent.trim()).toBe('presence.playing_away');
    expect(status.querySelector('.pres-dot').className).toBe('pres-dot pres-dot--warn pres-dot--half');
    delete window.PresenceView;
  });
});
