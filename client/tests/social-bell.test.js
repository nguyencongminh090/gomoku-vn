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
const badge = () => document.querySelector('.pbell .pbell__badge'); // .pchat__btn (#370) has its own badge
const items = () => [...document.querySelectorAll('.pbell__item')];

afterEach(() => { jest.useRealTimers(); });

describe('chat icon (#370)', () => {
  it('members get a chat link to social.html left of the bell, badge from dmUnread; guests get none', async () => {
    boot({ routes: { 'GET /api/notifications': () => json({ unread: 0, items: [], dmUnread: 4 }), 'GET /api/rankings/me': () => json({ ratings: {} }) } });
    await tick();
    const chat = document.querySelector('.pchat__btn');
    expect(chat.getAttribute('href')).toBe('/social.html');
    expect(chat.nextElementSibling.classList.contains('pbell')).toBe(true);
    expect(chat.querySelector('.pbell__badge').textContent).toBe('4');
    expect(chat.getAttribute('aria-label')).toBe('shell.chat (4)');
    window.PlatformShell.setDmUnread(0);
    expect(chat.querySelector('.pbell__badge').hidden).toBe(true);
    boot({ user: { userId: 'g', displayName: 'G', isGuest: true }, routes: {} });
    expect(document.querySelector('.pchat__btn')).toBeNull();
  });
});

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
    const btn = document.querySelector('.pbell .pbell__btn');
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

describe('social page (#370 chat-first)', () => {
  const P = (u, extra) => ({ username: u, displayName: u.toUpperCase(), avatarUrl: null, ...extra });
  const friends = { friends: [P('bob', { online: false, activity: null })], incoming: [P('cat')], outgoing: [P('dan')] };
  const EMPTY = { friends: [], incoming: [], outgoing: [] };
  const NOCH = { incoming: [], outgoing: [] };
  const SUM = (extra) => ({ with: P('bob'), rating: { category: 'caro', rating: 1702, provisional: true }, h2h: { wins: 7, losses: 5, draws: 0, winPct: 58 },
    last5: ['W', 'L', 'D'], games: [], friendship: 'friends', ...extra });

  // Each boot re-runs social.js; drop the previous instance's document/window listeners so only one page lives.
  const added = [];
  beforeAll(() => {
    for (const tgt of [document, window]) {
      const orig = tgt.addEventListener.bind(tgt);
      tgt.addEventListener = (type, fn, o) => { added.push([tgt, type, fn, o]); orig(type, fn, o); };
    }
  });
  afterAll(() => { delete document.addEventListener; delete window.addEventListener; });
  beforeEach(() => {
    window.EscapeUtils = require('../js/escape-utils.js');
    history.replaceState(null, '', '/social.html');
    delete window.matchMedia;
    document.body.className = '';
  });

  async function bootPage(routes) {
    for (const [tgt, type, fn, o] of added.splice(0)) tgt.removeEventListener(type, fn, o);
    boot({ user: { userId: 'u1', displayName: 'Me', isGuest: false }, routes: {
      'GET /api/notifications': () => json({ unread: 0, items: [] }), 'GET /api/rankings/me': () => json({ ratings: {} }),
      'GET /api/friends': () => json(EMPTY), 'GET /api/challenges': () => json(NOCH), 'GET /api/dm': () => json({ conversations: [] }),
      'GET /api/friends/code': () => json({ code: 'me#0042' }), 'GET /api/challenges/online': () => json({ players: [] }),
      'GET /api/friends/bob/summary': () => json(SUM()),
      ...routes } });
    require('../js/challenge-modal.js');
    require('../js/social.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await tick();
  }
  const aria = (sel) => [...document.querySelectorAll(sel)].map((b) => b.getAttribute('aria-label') || b.textContent);
  const fire = async (hash) => { location.hash = hash; window.dispatchEvent(new HashChangeEvent('hashchange')); await tick(); };

  describe('left column', () => {
    it('friend requests are pinned with accept / decline; sent requests listed with cancel; names one-line with title', async () => {
      await bootPage({ 'GET /api/friends': () => json(friends) });
      expect(aria('#sc-incoming button')).toEqual(['friends.accept', 'friends.decline']);
      expect(document.querySelector('#sc-incoming .sc-ci--req')).not.toBeNull();
      expect(document.querySelector('#sc-incoming .sc-ci__m').textContent).toBe('social.req_friend');
      expect(aria('#sc-outgoing button')).toEqual(['friends.cancel']);
      expect(document.getElementById('sc-out-box').hidden).toBe(false);
      const name = document.querySelector('#sc-incoming .sc-ci__t');
      expect(name.classList.contains('sc-nm')).toBe(true);
      expect(name.title).toBe('CAT');
      expect(name.getAttribute('href')).toBe('/u/cat');
    });

    it('accept hits /accept then reloads: the request leaves the pinned list, the friend joins the strip', async () => {
      let state = friends;
      await bootPage({
        'GET /api/friends': () => json(state),
        'POST /api/friends/cat/accept': () => { state = { friends: [P('bob'), P('cat')], incoming: [], outgoing: [P('dan')] }; return json({ status: 'friends' }); },
      });
      document.querySelector('#sc-incoming button').click();
      await tick();
      expect(document.querySelectorAll('#sc-incoming .sc-ci')).toHaveLength(0);
      expect([...document.querySelectorAll('#sc-story [data-user]')].map((b) => b.dataset.user)).toEqual(['bob', 'cat']);
    });

    it('story strip: online first (playing before free before watching), presence on the dot, offline greyed, + Thêm focuses search', async () => {
      await bootPage({ 'GET /api/friends': () => json({ ...EMPTY, friends: [
        P('off', { online: false, activity: null }), P('wat', { online: true, activity: 'watching', roomId: 'r2' }),
        P('fre', { online: true, activity: 'free' }), P('pla', { online: true, activity: 'playing', startedAt: Date.now(), roomId: 'r1' })] }) });
      const items = [...document.querySelectorAll('#sc-story [data-user]')];
      expect(items.map((b) => b.dataset.user)).toEqual(['pla', 'fre', 'wat', 'off']);
      expect(items.map((b) => b.querySelector('.sc-av').dataset.st)).toEqual(['playing', 'free', 'watching', undefined]);
      expect(items[3].classList.contains('is-off')).toBe(true);
      document.querySelector('.sc-story__add').click();
      expect(document.activeElement).toBe(document.getElementById('sc-add-q'));
    });

    it('guest (403) sees the sign-in note; server error shows the error note', async () => {
      await bootPage({ 'GET /api/friends': () => json({}, 403) });
      expect(document.getElementById('sc-status').textContent).toBe('social.guest');
      await bootPage({ 'GET /api/friends': () => json({}, 500) });
      expect(document.getElementById('sc-status').textContent).toBe('social.error');
    });
  });

  describe('Thông báo view (#notifs, the bell "Xem tất cả")', () => {
    const notifs = { unread: 1, items: [N(2, 'friend_request'), N(1, 'friend_accepted', true)] };
    const rows = () => [...document.querySelectorAll('#sc-notifs .prow')];

    it('bell "see all" targets #notifs; that view lists the bell items as text, unread first-class', async () => {
      await bootPage({ 'GET /api/notifications': () => json(notifs) });
      expect(document.querySelector('.pbell__all').getAttribute('href')).toBe('/social.html#notifs');
      expect(document.getElementById('sc-notifs-view').hidden).toBe(true);
      await fire('#notifs');
      expect(document.getElementById('sc-notifs-view').hidden).toBe(false);
      expect(document.getElementById('dm-thread').hidden).toBe(true);
      expect(rows().map((r) => r.textContent)).toEqual(['notif.friend_request{"name":"<b>Ann</b>"}', 'notif.friend_accepted{"name":"<b>Ann</b>"}']);
      expect(document.querySelector('#sc-notifs b')).toBeNull();
      expect(rows()[0].querySelector('.pdot--on')).not.toBeNull();
      expect(rows()[1].querySelector('.pdot--on')).toBeNull();
    });

    it('opening an unread row marks it read; Back closes the view', async () => {
      const reads = [];
      location.hash = '#notifs';
      await bootPage({ 'GET /api/notifications': () => json(notifs),
        'POST /api/notifications/read': (o) => { reads.push(JSON.parse(o.body)); return json({ unread: 0 }); } });
      rows()[0].addEventListener('click', (e) => e.preventDefault());
      rows()[0].click();
      await tick();
      expect(reads).toEqual([{ id: 2 }]);
      document.getElementById('sc-notifs-back').click();
      await tick();
      expect(document.getElementById('sc-notifs-view').hidden).toBe(true);
      expect(location.hash).toBe('');
    });

    it('the read POST uses keepalive: a row that navigates away must not abort it (stayed unread)', async () => {
      const opts = [];
      location.hash = '#notifs';
      await bootPage({ 'GET /api/notifications': () => json({ unread: 1, items: [N(3, 'friend_request')] }), // fresh: markRead mutates items
        'POST /api/notifications/read': (o) => { opts.push(o); return json({ unread: 0 }); } });
      rows()[0].addEventListener('click', (e) => e.preventDefault());
      rows()[0].click();
      await tick();
      expect(opts[0].keepalive).toBe(true);
    });

    // Reading the thread deletes the `dm` bell row server-side; the bell + this view used to keep it until the 60 s poll.
    it.each([
      ['conversation has unread', 2],
      ['conversation already 0 but the bell still holds the dm row', 0],
    ])('opening a DM thread refreshes the bell at once (%s)', async (_, convUnread) => {
      const conv = { with: P('bob'), last: { text: 'hi', mine: false, at: new Date().toISOString() }, unread: convUnread };
      let read = false;
      const dmN = { ...N(7, 'dm'), payload: { from: { username: 'bob', displayName: 'BOB' } } };
      location.hash = '#notifs';
      await bootPage({
        'GET /api/notifications': () => json(read ? { unread: 0, items: [] } : { unread: 1, items: [dmN] }),
        'GET /api/dm': () => json({ conversations: [{ ...conv, unread: read ? 0 : convUnread }] }),
        'GET /api/dm/bob': () => json({ with: P('bob'), messages: [] }),
        'POST /api/dm/bob/read': () => { read = true; return json({ unread: 0 }); },
      });
      expect(badge().hidden).toBe(false);
      expect(rows()[0].querySelector('.pdot--on')).not.toBeNull();
      await fire('#dm=bob');
      expect(read).toBe(true);
      expect(badge().hidden).toBe(true);
      expect(document.querySelector('#sc-notifs .pdot--on')).toBeNull();
    });
  });

  describe('challenges', () => {
    const CH = {
      incoming: [{ id: 'c1', rule: 'caro', time: '3+2', rated: true, from: P('cat') }],
      outgoing: [{ id: 'c2', rule: 'freestyle', time: '1+0', rated: false, to: P('dan') }],
    };
    const crow = () => [...document.querySelectorAll('#sc-challenges .sc-ci')];

    it('pinned rows: who · "thách bạn" + rule · clock · rated; icon buttons accept/decline vs cancel', async () => {
      await bootPage({ 'GET /api/challenges': () => json(CH) });
      const rows = crow();
      expect(rows).toHaveLength(2);
      expect([...rows[0].querySelectorAll('.prow__meta > span')].map((x) => x.textContent)).toEqual(['social.ch_in', 'rankings.cat_caro', '3+2', 'challenge.rated']);
      expect(rows[0].querySelector('.sc-ci__t').textContent).toBe('CAT');
      expect(aria('#sc-challenges .sc-ci:first-child .sc-ci__acts button')).toEqual(['challenge.accept', 'friends.decline']);
      expect(rows[1].textContent).toContain('social.ch_out');
      expect(rows[1].textContent).not.toContain('challenge.rated');
      expect([...rows[1].querySelectorAll('.sc-ci__acts button')].map((b) => b.getAttribute('aria-label'))).toEqual(['friends.cancel']);
    });

    it('#222: full settings, series and stake on the row; a stake row is highlighted', async () => {
      const settings = { boardSize: 19, winningRule: 'standard', ranked: true, ruleWall: false, rulePortal: true, ruleSwap2: false, timerMode: 'blitz', timerSeconds: 300, timerIncrementSeconds: 3 };
      await bootPage({ 'GET /api/challenges': () => json({ incoming: [{ id: 'c3', rule: 'standard', rated: true, settings, games: 3, stake: 'swap', from: P('cat') }], outgoing: [] }) });
      const row = crow()[0];
      expect([...row.querySelectorAll('.prow__meta > span')].map((x) => x.textContent)).toEqual(
        ['social.ch_in', 'rankings.cat_standard', '19×19', 'modal.rule_portal', "5'+3s", 'challenge.best_of{"n":3}', 'challenge.rated', 'challenge.stake_swap']);
      expect(row.classList.contains('sc-ci--stake')).toBe(true);
    });

    it('decline calls DELETE and refreshes; the 10 s poll empties the list; accept goes to the room (id url-encoded)', async () => {
      let state = CH;
      await bootPage({
        'GET /api/challenges': () => json(state),
        'DELETE /api/challenges/c1': () => { state = { incoming: [], outgoing: CH.outgoing }; return json({ ok: true }); },
        'POST /api/challenges/c1/accept': () => json({ roomId: 'r 1' }),
      });
      crow()[0].querySelector('[data-act="friends.decline"]').click();
      await tick();
      expect(crow()).toHaveLength(1);
      state = { incoming: [], outgoing: [] };
      jest.advanceTimersByTime(10000);
      await tick();
      expect(crow()).toHaveLength(0);
      state = CH;
      await bootPage({ 'GET /api/challenges': () => json(CH), 'POST /api/challenges/c1/accept': () => json({ roomId: 'r 1' }) });
      crow()[0].querySelector('[data-act="challenge.accept"]').click();
      await tick();
      expect(global.fetch.mock.calls.some((c) => c[0] === '/api/challenges/c1/accept' && c[1].method === 'POST')).toBe(true);
    });

    it('a 404 on accept (expired) refreshes instead of erroring', async () => {
      let state = CH;
      await bootPage({ 'GET /api/challenges': () => json(state), 'POST /api/challenges/c1/accept': () => { state = { incoming: [], outgoing: [] }; return json({}, 404); } });
      crow()[0].querySelector('[data-act="challenge.accept"]').click();
      await tick();
      expect(crow()).toHaveLength(0);
      expect(document.getElementById('sc-status').textContent).toBe('');
    });

    it('the open thread with that person shows the challenge as a card (Vào chơi / Từ chối); clicking the row opens it', async () => {
      await bootPage({ 'GET /api/challenges': () => json(CH), 'GET /api/dm/cat': () => json({ with: P('cat'), hasMore: false, messages: [] }),
        'GET /api/friends/cat/summary': () => json(SUM({ with: P('cat') })) });
      expect(document.querySelectorAll('#dm-pending .sc-gcard')).toHaveLength(0);
      crow()[0].querySelector('.sc-ci__open').click();
      await tick();
      expect(location.hash).toBe('#dm=cat');
      const card = document.querySelector('#dm-pending .sc-gcard');
      expect(card.textContent).toContain('social.ch_card_in{"name":"CAT"}');
      expect([...card.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['social.ch_play', 'friends.decline']);
      expect(card.querySelector('svg.sc-mb')).not.toBeNull();
    });

    it('#222: the sword button and the #challenge deep link open the friend picker; the thread header challenges that friend', async () => {
      await bootPage({ 'GET /api/dm/bob': () => json({ with: P('bob'), hasMore: false, messages: [] }) });
      document.getElementById('sc-challenge-new').click();
      await tick();
      expect(document.querySelector('.pchal #pchal-title').textContent).toBe('challenge.pick_title');
      document.querySelector('.pchal').remove();
      await fire('#challenge');
      expect(document.querySelector('.pchal')).not.toBeNull();
      expect(location.hash).toBe('');
      document.querySelector('.pchal').remove();
      await fire('#dm=bob');
      document.getElementById('dm-challenge').click();
      await tick();
      expect(document.querySelector('.pchal #pchal-title').textContent).toBe('challenge.modal_title{"name":"BOB"}');
    });
  });

  describe('direct messages', () => {
    const CONV = [{ with: P('bob'), last: { text: 'hi &lt;b&gt;', mine: false, at: '2026-10-09T00:00:00Z' }, unread: 2 }];
    const THREAD = { with: P('bob'), hasMore: false, messages: [{ id: 1, mine: false, text: '&lt;b&gt;boo&lt;/b&gt; hi', at: '2026-10-09T00:00:00Z', read: false }] };
    const msgs = () => [...document.querySelectorAll('#dm-log .sc-msg')];

    it('lists conversations (decoded, unread badge, header badge) and opens one: thread as text, marks read', async () => {
      window.matchMedia = () => ({ matches: false }); // neither phone nor wide: no auto-open
      let convs = CONV;
      const reads = [];
      await bootPage({
        'GET /api/dm': () => json({ conversations: convs }),
        'GET /api/dm/bob': () => json(THREAD),
        'POST /api/dm/bob/read': () => { reads.push(1); convs = [{ ...CONV[0], unread: 0 }]; return json({ unread: 0 }); },
      });
      const row = document.querySelector('#dm-list .sc-conv');
      expect(row.textContent).toContain('hi <b>');
      expect(row.querySelector('.sc-badge').textContent).toBe('2');
      expect(row.classList.contains('sc-ci--u')).toBe(true);
      expect(document.querySelector('.pchat__btn .pbell__badge').textContent).toBe('2');
      expect(document.getElementById('dm-thread').hidden).toBe(true);
      row.click();
      await tick();
      expect(document.getElementById('dm-thread').hidden).toBe(false);
      const msg = msgs()[0];
      expect(msg.textContent).toBe('<b>boo</b> hi');
      expect(msg.querySelector('b')).toBeNull();
      expect(reads).toHaveLength(1);
      expect(document.querySelector('#dm-list .sc-badge')).toBeNull();
      expect(document.querySelector('.pchat__btn .pbell__badge').hidden).toBe(true);
      expect(document.querySelector('#dm-list .sc-conv').classList.contains('is-on')).toBe(true);
      expect(location.hash).toBe('#dm=bob');
    });

    it('desktop with no link opens the newest conversation; #dm=<username> wins over it', async () => {
      const two = [CONV[0], { ...CONV[0], with: P('eve'), unread: 0 }];
      await bootPage({ 'GET /api/dm': () => json({ conversations: two }), 'GET /api/dm/bob': () => json(THREAD), 'POST /api/dm/bob/read': () => json({ unread: 0 }),
        'GET /api/dm/eve': () => json({ ...THREAD, with: P('eve') }), 'POST /api/dm/eve/read': () => json({ unread: 0 }) });
      expect(document.getElementById('dm-with').textContent).toBe('BOB');
      expect(document.getElementById('dm-empty').hidden).toBe(true);
      history.replaceState(null, '', '/social.html#dm=eve');
      await bootPage({ 'GET /api/dm': () => json({ conversations: two }), 'GET /api/dm/eve': () => json({ ...THREAD, with: P('eve') }), 'POST /api/dm/eve/read': () => json({ unread: 0 }) });
      expect(document.getElementById('dm-with').textContent).toBe('EVE');
      expect(document.getElementById('dm-with').getAttribute('href')).toBe('/u/eve');
      expect(document.getElementById('dm-with').title).toBe('EVE');
    });

    it('phone starts on the list; opening a chat covers the page (body.sc-open) and Back returns to the list', async () => {
      window.matchMedia = (q) => ({ matches: q.includes('max-width') });
      await bootPage({ 'GET /api/dm': () => json({ conversations: CONV }), 'GET /api/dm/bob': () => json(THREAD), 'POST /api/dm/bob/read': () => json({ unread: 0 }) });
      expect(document.getElementById('dm-thread').hidden).toBe(true);
      expect(document.body.classList.contains('sc-open')).toBe(false);
      document.querySelector('#dm-list .sc-conv').click();
      await tick();
      expect(document.body.classList.contains('sc-open')).toBe(true);
      expect(location.hash).toBe('#dm=bob');
      history.back = jest.fn(() => { history.replaceState(null, '', '/social.html'); window.dispatchEvent(new PopStateEvent('popstate')); });
      document.getElementById('dm-back').click();
      await tick();
      expect(history.back).toHaveBeenCalled();
      expect(document.body.classList.contains('sc-open')).toBe(false);
      expect(document.getElementById('dm-thread').hidden).toBe(true);
    });

    it('no conversations → empty state with my code and online people to befriend (friends excluded)', async () => {
      await bootPage({ 'GET /api/friends': () => json(friends),
        'GET /api/challenges/online': () => json({ players: [P('bob'), P('zed')] }) });
      expect(document.getElementById('dm-empty').hidden).toBe(false);
      expect(document.getElementById('sc-code2').textContent).toBe('me#0042');
      expect([...document.querySelectorAll('#sc-suggest .sc-ci__t')].map((n) => n.textContent)).toEqual(['ZED']);
      document.querySelector('#sc-suggest button').click();
      await tick();
      expect(global.fetch.mock.calls.some((c) => c[0] === '/api/friends/zed' && c[1].method === 'POST')).toBe(true);
    });

    it('send posts the text, appends it as mine and clears the input; failure keeps the text and says so', async () => {
      const sent = [];
      let fail = false;
      await bootPage({
        'GET /api/dm/bob': () => json({ ...THREAD, messages: [] }),
        'POST /api/dm/bob': (o) => { sent.push(JSON.parse(o.body)); return fail ? json({}, 429) : json({ id: 7, mine: true, text: 'yo', at: '2026-10-09T00:00:00Z', read: false }, 201); },
      });
      await fire('#dm=bob');
      const input = document.getElementById('dm-input');
      expect(input.placeholder).toBe('social.dm_ph{"name":"BOB"}');
      input.value = ' yo ';
      document.getElementById('dm-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await tick();
      expect(sent).toEqual([{ text: 'yo' }]);
      expect(input.value).toBe('');
      expect(document.querySelector('#dm-log .sc-msg--me').textContent).toBe('yo');
      fail = true;
      input.value = 'again';
      document.getElementById('dm-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await tick();
      expect(input.value).toBe('again');
      expect(document.getElementById('dm-note').textContent).toBe('social.dm_slow');
      expect(msgs()).toHaveLength(1);
    });

    it('polling appends only newer messages and keeps the input value + focus; empty text is never sent', async () => {
      let list = THREAD.messages;
      const posts = [];
      await bootPage({
        'GET /api/dm/bob': () => json({ ...THREAD, messages: list }),
        'POST /api/dm/bob/read': () => json({ unread: 0 }),
        'POST /api/dm/bob': (o) => { posts.push(o); return json({}, 500); },
      });
      await fire('#dm=bob');
      const input = document.getElementById('dm-input');
      input.focus();
      input.value = 'typing';
      list = [...THREAD.messages, { id: 2, mine: true, text: 'later', at: '2026-10-09T00:00:01Z', read: false }];
      jest.advanceTimersByTime(5000);
      await tick();
      expect(msgs().map((m) => m.textContent)).toEqual(['<b>boo</b> hi', 'later']);
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe('typing');
      input.value = '   ';
      document.getElementById('dm-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await tick();
      expect(posts).toHaveLength(0);
    });

    it('finished games become result cards merged by time between messages, with day chips and a replay link', async () => {
      const day1 = '2026-10-08T10:00:00Z';
      const day2a = '2026-10-09T09:00:00Z';
      const day2b = '2026-10-09T11:00:00Z';
      const game = { id: 'g 1', result: 'W', color: 'BLACK', reason: 'normal', boardSize: 15, moves: 41, endedAt: '2026-10-09T10:00:00Z' };
      await bootPage({
        'GET /api/dm/bob': () => json({ ...THREAD, messages: [
          { id: 1, mine: false, text: 'a', at: day1, read: true }, { id: 2, mine: true, text: 'b', at: day2a, read: true }, { id: 3, mine: false, text: 'c', at: day2b, read: true }] }),
        'GET /api/friends/bob/summary': () => json(SUM({ games: [game] })),
      });
      await fire('#dm=bob');
      const kids = [...document.getElementById('dm-log').children].map((n) => n.className.split(' ')[0] + ':' + (n.dataset.id || n.dataset.game || n.textContent));
      expect(kids.filter((k) => !k.startsWith('sc-day'))).toEqual(['sc-msg:1', 'sc-msg:2', 'sc-res:g 1', 'sc-msg:3']);
      expect(document.querySelectorAll('#dm-log .sc-day')).toHaveLength(2);
      const card = document.querySelector('#dm-log .sc-res');
      expect(card.textContent).toContain('social.res_win');
      expect(card.textContent).toContain('social.res_moves{"n":41}');
      expect(card.querySelector('a').getAttribute('href')).toBe('/replay/g%201');
    });
  });

  describe('thread header + profile pane', () => {
    const THREAD = { with: P('bob'), hasMore: false, messages: [] };

    it('a playing friend shows "Đang chơi · m:ss" and a Xem ván link to the room; offline shows no watch link', async () => {
      await bootPage({ 'GET /api/friends': () => json({ ...EMPTY, friends: [P('bob', { online: true, activity: 'playing', startedAt: Date.now() - 65000, roomId: 'r 9' })] }),
        'GET /api/dm/bob': () => json(THREAD) });
      await fire('#dm=bob');
      expect(document.getElementById('dm-st').textContent).toMatch(/^social\.st_playing · 1:0[5-6]$/);
      expect(document.querySelector('#dm-st .sc-dot').dataset.st).toBe('playing');
      expect(document.querySelector('#dm-av').dataset.st).toBe('playing');
      const watch = document.getElementById('dm-watch');
      expect(watch.hidden).toBe(false);
      expect(watch.getAttribute('href')).toBe('/room.html?id=r%209');
      await bootPage({ 'GET /api/friends': () => json({ ...EMPTY, friends: [P('bob', { online: false, activity: null })] }), 'GET /api/dm/bob': () => json(THREAD) });
      expect(document.getElementById('dm-st').textContent).toBe('social.st_offline');
      expect(document.getElementById('dm-watch').hidden).toBe(true);
    });

    it('profile pane: Elo with "?" when provisional, head-to-head, win %, last-5 chips, Hồ sơ link; unfriend needs two taps', async () => {
      let removed = 0;
      await bootPage({ 'GET /api/dm/bob': () => json(THREAD), 'DELETE /api/friends/bob': () => { removed++; return json({ status: 'none' }); } });
      await fire('#dm=bob');
      const who = document.getElementById('sc-who');
      expect(who.hidden).toBe(false);
      expect(document.getElementById('sc-app').classList.contains('has-who')).toBe(true);
      expect([...who.querySelectorAll('.sc-stat b')].map((b) => b.textContent)).toEqual(['1702?', '7–5', '58%']);
      expect([...who.querySelectorAll('.sc-form5 i')].map((i) => i.className)).toEqual(['is-W', 'is-L', 'is-D']);
      expect(who.querySelector('.sc-who__n').title).toBe('BOB');
      expect(who.querySelector('a.pbtn').getAttribute('href')).toBe('/u/bob');
      const un = who.querySelector('.sc-unfriend');
      un.click();
      await tick();
      expect(removed).toBe(0);
      expect(un.textContent).toBe('social.unfriend_confirm');
      un.click();
      await tick();
      expect(removed).toBe(1);
      expect(who.querySelector('.sc-unfriend')).toBeNull();
    });

    it('no games / unrated → dashes and a "no games" note; a failed summary keeps the pane hidden', async () => {
      await bootPage({ 'GET /api/dm/bob': () => json(THREAD),
        'GET /api/friends/bob/summary': () => json(SUM({ rating: null, h2h: { wins: 0, losses: 0, draws: 0, winPct: null }, last5: [] })) });
      await fire('#dm=bob');
      expect([...document.querySelectorAll('#sc-who .sc-stat b')].map((b) => b.textContent)).toEqual(['—', '0–0', '—']);
      expect(document.querySelector('#sc-who .sc-last').textContent).toBe('social.no_games');
      await bootPage({ 'GET /api/dm/bob': () => json(THREAD), 'GET /api/friends/bob/summary': () => json({}, 500) });
      await fire('#dm=bob');
      expect(document.getElementById('sc-who').hidden).toBe(true);
    });
  });
});
