/**
 * @jest-environment jsdom
 */
/*
 * #440 Phòng, direction H (js/rooms-h.js on the real index.html markup). Carries the invariants of the
 * suites it replaced: #382 counts come from the server stats + "Xem thêm" pages with lobby:rooms_query,
 * #390 a snapshot paints its cards at once (no stagger), B117 patches touch only changed cards, #432 the
 * "Luật chơi" tab draws the real guide.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const BODY = read('index.html').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/gi, '');
const SRC = read('js/rooms-h.js');
const GUIDE = read('js/room-rules-guide.js');

let client, created, store;
const ruleEvents = [];
window.addEventListener('rooms:rule', (e) => ruleEvents.push(e.detail.rule));
const t = (k, v) => (v ? `${k}(${Object.keys(v).sort().map((x) => `${x}=${v[x]}`).join(',')})` : k);

function fakeClient() {
  const handlers = {};
  return {
    acks: [],
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    emitAck(ev, data, ms, cb) { this.acks.push({ ev, data, cb }); },
    fire(ev, d) { for (const fn of handlers[ev] || []) fn(d); },
  };
}

function mount({ me = { userId: 'me', isGuest: false }, rule = null } = {}) {
  document.body.innerHTML = BODY;
  window.eval(GUIDE);
  window.eval(SRC);
  client = fakeClient();
  ruleEvents.length = 0;
  created = [];
  store = new Map(rule ? [['gvn_rooms_rule', rule]] : []);
  return window.RoomsH.create({
    root: document.getElementById('panel-tables'),
    client,
    t,
    avatar: (url, name, cls) => `<span class="pav ${cls}" data-url="${url || ''}" aria-hidden="true"></span>`, // PlatformShell.avatar: initials/photo, no name text
    icon: (n) => `<svg class="icon" data-i="${n}"></svg>`,
    me: () => me,
    openCreate: (r) => created.push(r),
    storage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
  });
}

const $ = (id) => document.getElementById(id);
const cards = () => [...document.querySelectorAll('#room-list .room-row')].map((n) => n.dataset.roomId);
const stats = (o = {}) => ({ rooms: 3, open: 1, live: 1, watch: 0, playing: 4, byRule: { freestyle: { open: 1, total: 3 }, caro: { open: 0, total: 2 }, standard: { open: 0, total: 0 }, renju: { open: 1, total: 1 } }, ...o });
const P = (name, o = {}) => ({ displayName: name, avatarUrl: null, rating: null, provisional: false, ...o });
const room = (id, o = {}) => ({ roomId: id, roomName: 'R' + id, state: 'idle', playerCount: 1, userCount: 1, players: [P('An', { rating: 1890 }), null],
  winningRule: 'freestyle', boardSize: 15, timerMode: 'per_move', timerSeconds: 90, timerIncrementSeconds: 0, ranked: true, ...o });
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => { jest.useRealTimers(); });

describe('stats bar + tabs', () => {
  it('online from lobby.js, playing + per-rule badges from the channel stats; no "Tất cả" tab', () => {
    const h = mount();
    h.setOnline(26);
    client.fire('lobby:update', { rooms: [room('#A3F')], stats: stats() });
    expect($('rooms-n-online').textContent).toBe('26');
    expect($('rooms-n-playing').textContent).toBe('4');
    const tabs = [...document.querySelectorAll('#rooms-tabs [role="tab"]')];
    expect(tabs.map((b) => b.dataset.tab)).toEqual(['freestyle', 'caro', 'standard', 'renju', 'rules']);
    expect(tabs.map((b) => (b.querySelector('.vtab__n') || {}).textContent)).toEqual(['3', '2', '0', '1', undefined]);
    expect(tabs[0].textContent).toContain('rule.freestyle');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('a later message without stats keeps the last counts (no flicker to 0)', () => {
    mount();
    client.fire('lobby:update', { rooms: [room('#A3F')], stats: stats() });
    client.fire('lobby:patch', { upserts: [room('#A3F', { userCount: 3 })], removed: [] });
    expect($('rooms-n-playing').textContent).toBe('4');
  });

  it('a rule tab switch remembers the rule, fires rooms:rule once, and the rule rides on rule()', () => {
    const h = mount();
    document.querySelector('[data-tab="renju"]').click();
    expect(h.rule()).toBe('renju');
    expect(ruleEvents).toEqual(['renju']);
    expect(store.get('gvn_rooms_rule')).toBe('renju');
    document.querySelector('[data-tab="renju"]').click();
    expect(ruleEvents).toEqual(['renju']); // same tab: no re-subscribe
    expect(mount({ rule: 'caro' }).rule()).toBe('caro');
    expect(mount({ rule: 'nonsense' }).rule()).toBe('freestyle');
  });

  it('#432: "Luật chơi" shows the real guide with the selected rule marked "Đang chọn"; arrows move tabs', () => {
    mount({ rule: 'renju' });
    document.querySelector('[data-tab="rules"]').click();
    expect($('rooms-main').hidden).toBe(true);
    expect($('rooms-rules').hidden).toBe(false);
    const live = $('rooms-rules').querySelector('[data-rule="renju"] .rg-live');
    expect(live.textContent).toBe('guide.selected');
    expect($('rooms-rules').querySelector('[data-rule="renju"]').open).toBe(true);
    expect(ruleEvents).toEqual([]); // the guide is not a channel
    document.querySelector('[data-tab="rules"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement.dataset.tab).toBe('freestyle');
    expect($('rooms-main').hidden).toBe(false);
  });
});

describe('cards (card v3)', () => {
  it('header #ID + state + viewers + Vào; two seat lines with Elo; one-line footer time | mode; no board, no "vs"', () => {
    mount();
    client.fire('lobby:update', { stats: stats(), rooms: [
      room('#R5E', { players: [null, P('Hà Vy', { rating: 1203, provisional: true })], timerMode: 'per_move', timerSeconds: 90, ranked: false }),
      room('#A3F', { state: 'playing', playerCount: 2, userCount: 25, players: [P('Nguyên', { rating: 2104 }), P('Khách 1', { isGuest: true })], timerMode: 'blitz', timerSeconds: 300, timerIncrementSeconds: 5 }),
      room('#Q8Z', { playerCount: 2, userCount: 2, players: [P('Mới', { rating: null }), P('B', { rating: 1475 })], timerMode: 'per_game', timerSeconds: 600 }),
    ] });
    const [a, b, c] = document.querySelectorAll('#room-list .h-card');
    expect(a.querySelector('.vcode').textContent).toBe('#R5E');
    expect(a.querySelector('.vstate').className).toBe('vstate is-open');
    expect(b.querySelector('.vstate').className).toBe('vstate is-live');
    expect(c.querySelector('.vstate').className).toBe('vstate is-ready');
    // Vào on every state: filled on a waiting table, outlined otherwise; it is the join control
    expect([a, b, c].map((n) => n.querySelector('.vbtn').textContent)).toEqual(['lobby.btn_join', 'lobby.btn_join', 'lobby.btn_join']);
    expect([a, b, c].map((n) => n.querySelector('.vbtn').classList.contains('vbtn--primary'))).toEqual([true, false, false]);
    expect(a.querySelector('.vbtn').dataset).toMatchObject({ action: 'joinRoom', arg: '#R5E' });
    expect(a.getAttribute('role')).toBeNull(); // the card is not a button around a button
    // seats
    expect(a.querySelectorAll('.h-seat')).toHaveLength(2);
    expect(a.querySelector('.h-seat--empty').textContent).toBe('lobby.seat_empty');
    expect([...a.querySelectorAll('.ve')].map((x) => x.textContent)).toEqual(['1203?']);
    expect([...b.querySelectorAll('.ve')].map((x) => x.textContent)).toEqual(['2104', 'rooms.guest']);
    expect([...c.querySelectorAll('.ve')].map((x) => x.textContent)).toEqual(['rooms.elo_new', '1475']);
    // viewers in the header (watchers = people minus seated), none when 0
    expect(b.querySelector('.h-card__eye').textContent).toContain('23');
    expect(a.querySelector('.h-card__eye')).toBeNull();
    // footer = time | mode only (no board size)
    const foot = (n) => [...n.querySelectorAll('.h-spec__i')].map((x) => x.textContent);
    expect(foot(a)).toEqual(['rooms.per_move(t=rooms.sec(n=90))', 'rooms.mode_friendly']);
    expect(foot(b)).toEqual(['rooms.plus(a=rooms.min(n=5),b=rooms.sec(n=5))', 'rooms.mode_rated']);
    expect(foot(c)).toEqual(['rooms.min(n=10)', 'rooms.mode_rated']);
    const html = $('room-list').innerHTML;
    expect(html).not.toMatch(/<svg class="mb"|rvs|15×15|·/);
    expect(html).not.toMatch(/animate-fade-up|animation-delay/); // #390: a snapshot paints at once
  });

  it('names are escaped', () => {
    mount();
    client.fire('lobby:update', { stats: stats(), rooms: [room('#X', { players: [P('<img src=x onerror=alert(1)>'), null] })] });
    expect(document.querySelector('#room-list img')).toBeNull();
    expect(document.querySelector('.h-seat__n').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('B117: a patch updates the held card in place (same node, focus kept), removes, appends; other rules ignored', () => {
    mount();
    client.fire('lobby:update', { stats: stats(), rooms: [room('#A'), room('#B')] });
    const nodeA = document.querySelector('[data-room-id="#A"]');
    nodeA.querySelector('.vbtn').focus();
    client.fire('lobby:patch', { upserts: [room('#A', { state: 'playing', playerCount: 2, players: [P('An'), P('Bo')] }), room('#C'), room('#Z', { winningRule: 'renju' })], removed: ['#B'] });
    expect(cards()).toEqual(['#A', '#C']);
    expect(document.querySelector('[data-room-id="#A"]')).toBe(nodeA);
    expect(nodeA.className).toBe('room-row h-card h-card--live');
    expect(document.activeElement).toBe(nodeA.querySelector('.vbtn'));
  });

  it('snapshot of another rule (late, from the previous channel) draws nothing of it', () => {
    mount();
    client.fire('lobby:update', { stats: stats(), rooms: [room('#A'), room('#R', { winningRule: 'renju' })] });
    expect(cards()).toEqual(['#A']);
  });
});

describe('#382 "Xem thêm" + server-side sort', () => {
  it('"Xem thêm" counts the rule\'s tables beyond the page and fetches the next page for this rule', () => {
    mount();
    client.fire('lobby:update', { stats: stats({ rooms: 40 }), rooms: [room('#A'), room('#B')] });
    expect($('rooms-more').hidden).toBe(false);
    expect($('rooms-more').textContent).toBe('lobby.rooms_more(n=38)');
    $('rooms-more').click();
    expect(client.acks.at(-1)).toMatchObject({ ev: 'lobby:rooms_query', data: { rule: 'freestyle', offset: 2 } });
    client.acks.at(-1).cb(null, { rooms: [room('#B'), room('#C')], matched: 40, stats: stats({ rooms: 40 }) });
    expect(cards()).toEqual(['#A', '#B', '#C']);
    expect($('rooms-more').textContent).toBe('lobby.rooms_more(n=37)');
  });

  it('a non-default sort asks the server (debounced) and the grid shows only its answer; patches add nothing new', () => {
    jest.useFakeTimers();
    mount();
    client.fire('lobby:update', { stats: stats(), rooms: [room('#A'), room('#B', { state: 'playing', playerCount: 2 })] });
    $('rooms-sort').value = 'time';
    $('rooms-sort').dispatchEvent(new Event('change'));
    expect(client.acks).toHaveLength(1); // roster only so far
    jest.advanceTimersByTime(300);
    const q = client.acks.filter((a) => a.ev === 'lobby:rooms_query');
    expect(q).toHaveLength(1);
    expect(q[0].data).toEqual({ rule: 'freestyle', offset: 0, sort: 'time' });
    q[0].cb(null, { rooms: [room('#A')], matched: 1, stats: stats() });
    expect(cards()).toEqual(['#A']);
    expect($('rooms-more').hidden).toBe(true);
    client.fire('lobby:patch', { upserts: [room('#N')], removed: [] });
    expect(cards()).toEqual(['#A']);
  });

  it('a reply for a previous tab or sort is dropped', () => {
    jest.useFakeTimers();
    mount();
    client.fire('lobby:update', { stats: stats(), rooms: [] });
    $('rooms-sort').value = 'rank';
    $('rooms-sort').dispatchEvent(new Event('change'));
    jest.advanceTimersByTime(300);
    const stale = client.acks.filter((a) => a.ev === 'lobby:rooms_query').at(-1);
    document.querySelector('[data-tab="caro"]').click();
    stale.cb(null, { rooms: [room('#OLD')], matched: 1, stats: stats() });
    expect(cards()).toEqual([]);
  });

});

describe('no filter chips', () => {
  it('the tools row holds the sort select only', () => {
    mount();
    expect(document.querySelector('[data-f]')).toBeNull();
    expect($('rooms-filters')).toBeNull();
    expect([...$('rooms-sort').options].map((o) => o.value)).toEqual(['state', 'rank', 'time']);
  });
});

describe('empty tab', () => {
  it('names the rule and "Mở bàn <luật>" opens the create modal on that rule', () => {
    mount({ rule: 'renju' });
    client.fire('lobby:update', { stats: stats(), rooms: [] });
    expect(document.querySelector('.vempty b').textContent).toBe('rooms.empty(rule=rule.renju)');
    document.querySelector('[data-create-rule]').click();
    expect(created).toEqual(['renju']);
  });

  it('before the first snapshot the grid says nothing (no false "empty")', () => {
    mount();
    expect($('room-list').innerHTML).toBe('');
  });

  it('a tab switch shows no false "empty" until the new rule\'s snapshot lands', () => {
    mount();
    client.fire('lobby:update', { stats: stats(), rooms: [room('#A')] });
    document.querySelector('[data-tab="caro"]').click();
    expect(document.querySelector('#room-list .vempty')).toBeNull();
    client.fire('lobby:update', { stats: stats(), rooms: [room('#C', { winningRule: 'caro' })] });
    expect(cards()).toEqual(['#C']);
  });

  it('a sort change shows no false "empty" until the server answers', () => {
    jest.useFakeTimers();
    mount();
    client.fire('lobby:update', { stats: stats(), rooms: [room('#A')] });
    $('rooms-sort').value = 'rank';
    $('rooms-sort').dispatchEvent(new Event('change'));
    expect(document.querySelector('#room-list .vempty')).toBeNull();
    jest.advanceTimersByTime(300);
    client.acks.filter((a) => a.ev === 'lobby:rooms_query').at(-1).cb(null, { rooms: [], matched: 0, stats: stats() });
    expect(document.querySelector('#room-list .vempty b').textContent).toBe('rooms.empty(rule=rule.freestyle)');
  });
});

describe('roster rail', () => {
  const U = (id, name, ratings, o = {}) => ({ userId: id, displayName: name, isGuest: false, avatarUrl: null, ratings, ...o });

  it('queries the rule\'s rank order on snapshot; groups ranked → "Chưa có hạng <luật>" → Khách; rank chips', () => {
    mount();
    client.fire('lobby:update', { stats: stats(), rooms: [] });
    const q = client.acks.find((a) => a.ev === 'lobby:online_query');
    expect(q.data).toEqual({ rule: 'freestyle', q: '', offset: 0 });
    q.cb(null, { total: 5, matched: 5, users: [
      U('a', 'An', { freestyle: [2104, 1, false] }),
      U('me', 'Me', { freestyle: [1842, 35, true] }),
      U('b', 'Bo', { freestyle: [1500, null, true] }), // rating, no rank → unranked group (server predicate)
      U('c', 'Cu', {}),
      U('g', 'Khách 1', undefined, { isGuest: true }),
    ] });
    const rows = [...document.querySelectorAll('#rooms-roster > li')];
    expect(rows.map((r) => r.className.split(' ')[0] + ':' + r.textContent)).toEqual([
      'vrow:An2104#1', 'vrow:Me rooms.you1842?#35?',
      'vgroup:rooms.group_none(rule=rule.freestyle)', 'vrow:Bo1500?rooms.no_rank', 'vrow:Curooms.no_rank',
      'vgroup:rooms.group_guest', 'vrow:Khách 1rooms.guest',
    ]);
    expect(document.querySelector('#rooms-roster .vr--top1')).not.toBeNull();
    // others are the #159 profile-card control; your own row is not
    expect(document.querySelector('[data-user-id="a"]').getAttribute('role')).toBe('button');
    expect(document.querySelector('[data-user-id="me"]')).toBeNull();
    expect(document.getElementById('rooms-roster').hasAttribute('data-online-roster')).toBe(true);
    expect($('rooms-rail-sub').textContent).toBe('rooms.rail_sub(n=5,rule=rule.freestyle)');
  });

  it('"Tải thêm" pages with offset; search re-queries (debounced) with q', () => {
    jest.useFakeTimers();
    mount();
    client.fire('lobby:update', { stats: stats(), rooms: [] });
    client.acks.find((a) => a.ev === 'lobby:online_query').cb(null, { total: 120, matched: 120, users: Array.from({ length: 50 }, (_, i) => U('u' + i, 'U' + i, {})) });
    const more = document.querySelector('[data-roster-more]');
    expect(more.textContent).toBe('rooms.roster_more(n=50)');
    more.click();
    expect(client.acks.at(-1).data).toEqual({ rule: 'freestyle', q: '', offset: 50 });
    $('rooms-q').value = 'ng';
    $('rooms-q').dispatchEvent(new Event('input'));
    jest.advanceTimersByTime(250);
    expect(client.acks.at(-1).data).toEqual({ rule: 'freestyle', q: 'ng', offset: 0 });
  });

  it('presence changes re-query only while a roster is on screen (phone, sheet closed: once on open)', () => {
    jest.useFakeTimers();
    const h = mount();
    document.getElementById('rooms-rail').style.display = 'none'; // the phone CSS
    client.fire('lobby:update', { stats: stats(), rooms: [] });
    h.setOnline(3);
    jest.advanceTimersByTime(2000);
    expect(client.acks.filter((a) => a.ev === 'lobby:online_query')).toHaveLength(0);
    $('rooms-people').click();
    expect(client.acks.filter((a) => a.ev === 'lobby:online_query')).toHaveLength(1);
  });

  it('rail collapses to faces and back', () => {
    mount();
    $('rooms-rail-toggle').click();
    expect($('rooms-cols').classList.contains('is-rail-min')).toBe(true);
    expect($('rooms-rail-toggle').getAttribute('aria-expanded')).toBe('false');
    $('rooms-rail-toggle').click();
    expect($('rooms-cols').classList.contains('is-rail-min')).toBe(false);
  });

  it('phone: "Xem người online" opens the roster sheet; ✕ and Escape close it', () => {
    mount();
    client.fire('lobby:update', { stats: stats(), rooms: [] });
    client.acks.find((a) => a.ev === 'lobby:online_query').cb(null, { total: 1, matched: 1, users: [U('a', 'An', { freestyle: [2104, 1, false] })] });
    $('rooms-people').click();
    expect($('rooms-sheet').hidden).toBe(false);
    expect($('rooms-sheet-list').textContent).toContain('An');
    expect($('rooms-sheet-sub').textContent).toBe('rooms.sheet_sub(rule=rule.freestyle)');
    document.querySelector('#rooms-sheet .vicon-btn[data-sheet-close]').click();
    expect($('rooms-sheet').hidden).toBe(true);
    $('rooms-people').click();
    $('rooms-sheet').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect($('rooms-sheet').hidden).toBe(true);
    expect(document.body.classList.contains('rooms-sheet-open')).toBe(false);
    $('rooms-people').click();
    window.dispatchEvent(new HashChangeEvent('hashchange')); // Back to Home must not keep body's scroll lock
    expect($('rooms-sheet').hidden).toBe(true);
    expect(document.body.classList.contains('rooms-sheet-open')).toBe(false);
  });
});

describe('static guards', () => {
  const css = read('css/rooms-h.css');
  it('card text never wraps: header, seat names and footer are nowrap; time is the only ellipsis slot in the footer', () => {
    expect(css).toMatch(/\.h-card__top \{[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.h-seat__n \{[^}]*white-space: nowrap/);
    expect(css).toMatch(/\.h-card__foot \{[^}]*white-space: nowrap/);
    expect(css).toMatch(/@container \(max-width: 244px\) \{ \.h-card__eye \{ display: none; \} \}/);
    expect(css).not.toMatch(/border-left: 3px/); // no coloured side stripe
  });
  it('the bars sit under the 56px nav; body overflow-x is never hidden (#215 sticky)', () => {
    expect(css).toMatch(/\.rooms-bar \{ position: sticky; top: 56px;/);
    expect(css).not.toMatch(/overflow-x: hidden/);
  });
});
