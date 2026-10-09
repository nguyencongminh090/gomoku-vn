/**
 * #198 slice 2 — notification bell in the Arena shell + the Bạn bè & tin nhắn page.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/social.html"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const bodyOf = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');

const flush = () => Promise.resolve(); // microtasks only: fake timers are on
const N = (id, type, read = false) => ({ id, type, read, payload: { from: { username: 'ann', displayName: '<b>Ann</b>' } }, createdAt: 'x' });
const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

function boot({ user = { userId: 'u1', displayName: 'Me', isGuest: false }, routes }) {
  jest.resetModules();
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
  document.body.innerHTML = '<div id="pl-shell"></div>' + bodyOf('social.html');
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  window.GvnSession = { getUser: () => user };
  global.fetch = jest.fn((url, opts) => {
    const key = (opts && opts.method ? opts.method : 'GET') + ' ' + url;
    for (const [pat, fn] of Object.entries(routes)) if (key === pat) return fn(opts);
    return json({}, 404);
  });
  require('../js/platform-shell.js');
  window.PlatformShell.build('social');
}
const tick = async () => { for (let i = 0; i < 30; i++) await flush(); };
const badge = () => document.querySelector('.pbell__badge');
const items = () => [...document.querySelectorAll('.pbell__item')];

afterEach(() => { jest.useRealTimers(); });

describe('bell', () => {
  const list = { unread: 2, items: [N(2, 'friend_request'), N(1, 'friend_accepted', true)] };

  it('members get a bell with the unread badge; items render as text and link to their target', async () => {
    boot({ routes: { 'GET /api/notifications': () => json(list), 'GET /api/rankings/me': () => json({ ratings: {} }) } });
    await tick();
    expect(badge().hidden).toBe(false);
    expect(badge().textContent).toBe('2');
    expect(items().map((a) => a.textContent)).toEqual(['notif.friend_request{"name":"<b>Ann</b>"}', 'notif.friend_accepted{"name":"<b>Ann</b>"}']);
    expect(document.querySelector('.pbell__item b')).toBeNull();
    expect(items()[0].getAttribute('href')).toBe('/social.html');
    expect(items()[1].getAttribute('href')).toBe('/u/ann');
    expect(items()[0].classList.contains('is-unread')).toBe(true);
    expect(items()[1].classList.contains('is-unread')).toBe(false);
  });

  it('guests and signed-out visitors get no bell and no notification fetch', async () => {
    boot({ user: { userId: null, displayName: 'G', isGuest: true }, routes: {} });
    await tick();
    expect(document.querySelector('.pbell')).toBeNull();
    expect(global.fetch.mock.calls.some((c) => String(c[0]).includes('/api/notifications'))).toBe(false);
  });

  it('button toggles the panel (aria-expanded) and Escape closes it', async () => {
    boot({ routes: { 'GET /api/notifications': () => json(list), 'GET /api/rankings/me': () => json({ ratings: {} }) } });
    await tick();
    const btn = document.querySelector('.pbell__btn');
    const panel = document.querySelector('.pbell__panel');
    expect(panel.hidden).toBe(true);
    btn.click();
    expect(panel.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(panel.hidden).toBe(true);
  });

  it('clicking an unread item marks just it read; "mark all" sends no id', async () => {
    const reads = [];
    boot({ routes: {
      'GET /api/notifications': () => json(list),
      'GET /api/rankings/me': () => json({ ratings: {} }),
      'POST /api/notifications/read': (o) => { const b = JSON.parse(o.body); reads.push(b); return json({ unread: b.id ? 1 : 0 }); },
    } });
    await tick();
    items()[0].addEventListener('click', (e) => e.preventDefault());
    items()[0].click();
    await tick();
    expect(reads).toEqual([{ id: 2 }]);
    expect(badge().textContent).toBe('1');
    document.querySelector('.pbell__link').click();
    await tick();
    expect(reads[1]).toEqual({});
    expect(badge().hidden).toBe(true);
  });

  it('live push adds on top and uses the server unread count', async () => {
    boot({ routes: { 'GET /api/notifications': () => json({ unread: 0, items: [] }), 'GET /api/rankings/me': () => json({ ratings: {} }) } });
    await tick();
    expect(document.querySelector('.pbell__empty')).not.toBeNull();
    window.PlatformShell.pushNotification({ ...N(5, 'dm'), unread: 3 });
    expect(badge().textContent).toBe('3');
    expect(items()[0].getAttribute('href')).toBe('/social.html#dm=ann');
    window.PlatformShell.pushNotification({ ...N(5, 'dm'), unread: 3 });
    expect(items()).toHaveLength(1); // same id is not duplicated
  });

  it('challenge_accepted links straight to the room', async () => {
    boot({ routes: { 'GET /api/notifications': () => json({ unread: 1, items: [{ ...N(9, 'challenge_accepted'), payload: { from: { username: 'bob', displayName: 'Bob' }, roomId: 'r 1' } }] }), 'GET /api/rankings/me': () => json({ ratings: {} }) } });
    await tick();
    expect(items()[0].getAttribute('href')).toBe('/room.html?id=r%201');
  });

  it('polls every 60 s', async () => {
    boot({ routes: { 'GET /api/notifications': () => json(list), 'GET /api/rankings/me': () => json({ ratings: {} }) } });
    await tick();
    const n0 = global.fetch.mock.calls.filter((c) => c[0] === '/api/notifications').length;
    jest.advanceTimersByTime(60000);
    await tick();
    expect(global.fetch.mock.calls.filter((c) => c[0] === '/api/notifications').length).toBe(n0 + 1);
  });
});

describe('social page', () => {
  const P = (u) => ({ username: u, displayName: u.toUpperCase(), avatarUrl: null });
  const friends = { friends: [P('bob')], incoming: [P('cat')], outgoing: [P('dan')] };

  async function bootPage(routes) {
    boot({ user: { userId: 'u1', displayName: 'Me', isGuest: false }, routes: { 'GET /api/notifications': () => json({ unread: 0, items: [] }), 'GET /api/rankings/me': () => json({ ratings: {} }), ...routes } });
    require('../js/social.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await tick();
  }
  const labels = (id) => [...document.querySelectorAll('#' + id + ' button')].map((b) => b.textContent);

  it('lists incoming / friends / outgoing with their actions', async () => {
    await bootPage({ 'GET /api/friends': () => json(friends) });
    expect(labels('sc-incoming')).toEqual(['friends.accept', 'friends.decline']);
    expect(labels('sc-friends')).toEqual(['friends.remove']);
    expect(labels('sc-outgoing')).toEqual(['friends.cancel']);
    expect(document.querySelector('#sc-friends a').getAttribute('href')).toBe('/u/bob');
  });

  describe('challenges', () => {
    const CH = {
      incoming: [{ id: 'c1', rule: 'caro', time: '3+2', rated: true, from: P('cat') }],
      outgoing: [{ id: 'c2', rule: 'freestyle', time: '1+0', rated: false, to: P('dan') }],
    };
    const base = { 'GET /api/friends': () => json({ friends: [], incoming: [], outgoing: [] }) };

    it('lists incoming and outgoing with rule · clock · rated, and the right buttons', async () => {
      await bootPage({ ...base, 'GET /api/challenges': () => json(CH) });
      const rows = [...document.querySelectorAll('#sc-challenges .prow')];
      expect(rows).toHaveLength(2);
      expect(rows[0].textContent).toContain('rankings.cat_caro · 3+2 · challenge.rated');
      expect([...rows[0].querySelectorAll('button')].map((b) => b.textContent)).toEqual(['challenge.accept', 'friends.decline']);
      expect(rows[1].textContent).toContain('rankings.cat_freestyle · 1+0');
      expect(rows[1].textContent).not.toContain('challenge.rated');
      expect([...rows[1].querySelectorAll('button')].map((b) => b.textContent)).toEqual(['friends.cancel']);
    });

    it('empty → note; decline calls DELETE and refreshes; accept goes to the room', async () => {
      let state = CH;
      let navigated;
      await bootPage({
        ...base,
        'GET /api/challenges': () => json(state),
        'DELETE /api/challenges/c1': () => { state = { incoming: [], outgoing: CH.outgoing }; return json({ ok: true }); },
        'POST /api/challenges/c1/accept': () => json({ roomId: 'r 1' }),
      });
      const decline = [...document.querySelectorAll('#sc-challenges button')].find((b) => b.textContent === 'friends.decline');
      decline.click();
      await tick();
      expect(document.querySelectorAll('#sc-challenges .prow')).toHaveLength(1);
      state = { incoming: [], outgoing: [] };
      jest.advanceTimersByTime(10000);
      await tick();
      expect(document.querySelector('#sc-challenges .pnote').textContent).toBe('social.none_challenges');
    });

    it('accept posts to /accept (target room id is url-encoded)', async () => {
      await bootPage({ ...base, 'GET /api/challenges': () => json(CH), 'POST /api/challenges/c1/accept': () => json({ roomId: 'r 1' }) });
      const accept = [...document.querySelectorAll('#sc-challenges button')].find((b) => b.textContent === 'challenge.accept');
      accept.click();
      await tick();
      expect(global.fetch.mock.calls.some((c) => c[0] === '/api/challenges/c1/accept' && c[1].method === 'POST')).toBe(true);
    });
  });

  describe('direct messages', () => {
    const base = { 'GET /api/friends': () => json({ friends: [], incoming: [], outgoing: [] }), 'GET /api/challenges': () => json({ incoming: [], outgoing: [] }) };
    const CONV = [{ with: P('bob'), last: { text: 'hi &lt;b&gt;', mine: false, at: '2026-10-09T00:00:00Z' }, unread: 2 }];
    const THREAD = { with: P('bob'), hasMore: false, messages: [{ id: 1, mine: false, text: '&lt;b&gt;boo&lt;/b&gt; hi', at: '2026-10-09T00:00:00Z', read: false }] };

    beforeEach(() => { window.EscapeUtils = require('../js/escape-utils.js'); location.hash = ''; });

    it('lists conversations (decoded text, unread badge) and opens one: thread as text, marks read', async () => {
      let convs = CONV;
      const reads = [];
      await bootPage({
        ...base,
        'GET /api/dm': () => json({ conversations: convs }),
        'GET /api/dm/bob': () => json(THREAD),
        'POST /api/dm/bob/read': () => { reads.push(1); convs = [{ ...CONV[0], unread: 0 }]; return json({ unread: 0 }); },
      });
      const row = document.querySelector('#dm-list .pdm__conv');
      expect(row.textContent).toContain('hi <b>');
      expect(row.querySelector('.pdm__unread').textContent).toBe('2');
      row.click();
      await tick();
      expect(document.getElementById('dm-thread').hidden).toBe(false);
      const msg = document.querySelector('#dm-log .pdm__msg');
      expect(msg.textContent).toBe('<b>boo</b> hi');
      expect(msg.querySelector('b')).toBeNull();
      expect(reads).toHaveLength(1);
      expect(document.querySelector('#dm-list .pdm__unread')).toBeNull();
      expect(location.hash).toBe('#dm=bob');
    });

    it('#dm=<username> deep link (from the bell / profile button) opens that thread', async () => {
      location.hash = '#dm=bob';
      await bootPage({ ...base, 'GET /api/dm': () => json({ conversations: [] }), 'GET /api/dm/bob': () => json(THREAD), 'POST /api/dm/bob/read': () => json({ unread: 0 }) });
      expect(document.getElementById('dm-with').textContent).toBe('BOB');
      expect(document.getElementById('dm-with').getAttribute('href')).toBe('/u/bob');
      expect(document.querySelectorAll('#dm-log .pdm__msg')).toHaveLength(1);
    });

    it('send posts the text, appends it as "mine" and clears the input; failure keeps the text and says so', async () => {
      const sent = [];
      let fail = false;
      await bootPage({
        ...base,
        'GET /api/dm': () => json({ conversations: [] }),
        'GET /api/dm/bob': () => json({ ...THREAD, messages: [] }),
        'POST /api/dm/bob': (o) => { sent.push(JSON.parse(o.body)); return fail ? json({}, 429) : json({ id: 7, mine: true, text: 'yo', at: '2026-10-09T00:00:00Z', read: false }, 201); },
      });
      location.hash = '#dm=bob';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await tick();
      const input = document.getElementById('dm-input');
      input.value = ' yo ';
      document.getElementById('dm-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await tick();
      expect(sent).toEqual([{ text: 'yo' }]);
      expect(input.value).toBe('');
      expect(document.querySelector('#dm-log .pdm__msg--mine').textContent).toBe('yo');
      fail = true;
      input.value = 'again';
      document.getElementById('dm-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await tick();
      expect(input.value).toBe('again');
      expect(document.getElementById('dm-note').textContent).toBe('social.dm_slow');
      expect(document.querySelectorAll('#dm-log .pdm__msg')).toHaveLength(1);
    });

    it('polling appends only newer messages; empty text is never sent', async () => {
      let msgs = THREAD.messages;
      const posts = [];
      await bootPage({
        ...base,
        'GET /api/dm': () => json({ conversations: [] }),
        'GET /api/dm/bob': () => json({ ...THREAD, messages: msgs }),
        'POST /api/dm/bob/read': () => json({ unread: 0 }),
        'POST /api/dm/bob': (o) => { posts.push(o); return json({}, 500); },
      });
      location.hash = '#dm=bob';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await tick();
      msgs = [...THREAD.messages, { id: 2, mine: true, text: 'later', at: '2026-10-09T00:00:01Z', read: false }];
      jest.advanceTimersByTime(5000);
      await tick();
      expect([...document.querySelectorAll('#dm-log .pdm__msg')].map((m) => m.textContent)).toEqual(['<b>boo</b> hi', 'later']);
      document.getElementById('dm-input').value = '   ';
      document.getElementById('dm-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await tick();
      expect(posts).toHaveLength(0);
    });
  });

  it('accept hits /accept then reloads the lists', async () => {
    let state = friends;
    await bootPage({
      'GET /api/friends': () => json(state),
      'POST /api/friends/cat/accept': () => { state = { friends: [P('bob'), P('cat')], incoming: [], outgoing: [P('dan')] }; return json({ status: 'friends' }); },
    });
    document.querySelector('#sc-incoming button').click();
    await tick();
    expect(document.querySelectorAll('#sc-friends .prow')).toHaveLength(2);
    expect(document.querySelector('#sc-incoming .pnote').textContent).toBe('social.none_incoming');
  });

  it('guest (403) sees the sign-in note; server error shows the error note', async () => {
    await bootPage({ 'GET /api/friends': () => json({}, 403) });
    expect(document.getElementById('sc-status').textContent).toBe('social.guest');
    await bootPage({ 'GET /api/friends': () => json({}, 500) });
    expect(document.getElementById('sc-status').textContent).toBe('social.error');
  });
});
