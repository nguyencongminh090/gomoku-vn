/**
 * B195 — lobby screens (Chơi / Phòng / Giải đấu) and the "Chơi" dashboard (lobby-home.js).
 * Replaces B193's tab-sync suite: the shell nav's hashes now pick one of three screens.
 * B197 — quick match panel (match:* socket events).
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const BODY = read('index.html').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const SHELL = read('js/platform-shell.js');
const HCH = read('js/home-challenge.js'); // #361 classic script, loaded before the index-entry module
// ES module → classic script: swap the lobby.js import for a stub, expose the exports.
const HOME = read('js/lobby-home.js')
  .replace(/^import [^\n]*lobby\.js[^\n]*\n/m, 'const { client, setHeroTab } = window.__lobbyStub;\n')
  .replace(/^export (function|async function) (\w+)/gm, (m, kw, name) => `window.__home = window.__home || {}; window.__home.${name} = ${name};\n${kw} ${name}`);

const EMPTY = { myGame: null, myMatches: [], tournaments: [], live: [] };
const flush = () => new Promise((r) => setTimeout(r, 0));

// #252: a prior instance that got `match:status {waiting:true}` keeps a 1 s setInterval(renderQuickMatch)
// alive; under load it ticks between boots and paints its stale state into the NEXT test's #qm-line.
function stopPriorTicker() {
  const s = window.__lobbyStub;
  if (s && s.client) { try { s.client.fire('match:status', { waiting: false }); } catch { /* no handler yet */ } }
}

async function boot(url = '/index.html', data = EMPTY, user = null, opts = {}) {
  stopPriorTicker();
  if (window.HomeChallenge) window.HomeChallenge.close(); // a picker left open by the prior test keeps its document listener
  jest.useRealTimers();
  window.history.replaceState(null, '', url);
  document.body.innerHTML = BODY;
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  window.GvnSession = { getUser: () => user };
  window.joinRoom = jest.fn();
  const handlers = {};
  window.__lobbyStub = {
    setHeroTab: jest.fn(),
    client: { emitted: [], on(ev, fn) { handlers[ev] = fn; }, emit(ev, d) { this.emitted.push([ev, d]); }, fire(ev, d) { handlers[ev](d); } },
  };
  try { localStorage.clear(); } catch { /* ignore */ }
  if (opts.saved) localStorage.setItem('gvn_quickmatch', JSON.stringify(opts.saved));
  window.__home = {};
  global.fetch = jest.fn((u, init) => {
    const api = opts.api && opts.api(String(u), init);
    if (api) return Promise.resolve(api);
    return Promise.resolve(String(u).startsWith('/api/home')
      ? { ok: true, json: () => Promise.resolve(data) }
      : { ok: false, json: () => Promise.resolve({}) });
  });
  window.eval(SHELL);
  window.eval(HCH);
  window.PlatformShell.build('lobby');
  window.eval(HOME);
  await flush();
}

const visible = () => ['screen-home', 'panel-tables', 'panel-tournaments'].filter((id) => {
  const n = document.getElementById(id);
  return n.classList.contains('is-active') && !n.hidden;
});
const actions = () => ['btn-create-tournament'].filter((id) => !document.getElementById(id).hidden); // rooms create = the grid card #btn-create, shown with its screen (#364)
const navOn = () => [...document.querySelectorAll('#pl-shell .is-active')].map((a) => a.dataset.tab);

afterEach(() => { stopPriorTicker(); window.__home.showScreen && window.__home.showScreen('rooms'); }); // stop polling + quick-match ticker

/** Ticket meta segments (separate spans — no "·"-joined strings in the DOM). */
const segs = (row) => [...row.querySelectorAll('.hrow__meta > span')].map((x) => x.textContent);

describe('screens ↔ hash ↔ shell nav', () => {
  it.each([
    ['/index.html', 'screen-home', [], ['lobby', 'lobby'], 'home'],
    ['/index.html#rooms', 'panel-tables', [], ['rooms', 'rooms'], 'tables'],
    ['/index.html#tournaments', 'panel-tournaments', ['btn-create-tournament'], ['tournaments', 'tournaments'], 'tournaments'],
    ['/index.html#bogus', 'screen-home', [], ['lobby', 'lobby'], 'home'],
  ])('%s → %s', async (url, screen, acts, nav, hero) => {
    await boot(url);
    expect(visible()).toEqual([screen]);
    expect(actions()).toEqual(acts);
    expect(document.getElementById('lobby-bar').hidden).toBe(!acts.includes('btn-create-tournament')); // rooms actions live in the rooms .pbar now
    expect(navOn()).toEqual(nav);
    expect(window.__lobbyStub.setHeroTab).toHaveBeenLastCalledWith(hero);
  });

  it('legacy ?tab=tournaments lands on tournaments and is rewritten to #tournaments', async () => {
    await boot('/index.html?tab=tournaments');
    expect(visible()).toEqual(['panel-tournaments']);
    expect(location.search).toBe('');
    expect(location.hash).toBe('#tournaments');
  });

  it('hashchange switches screens; home clears the hash', async () => {
    await boot('/index.html');
    window.history.replaceState(null, '', '/index.html#rooms');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(visible()).toEqual(['panel-tables']);
    window.__home.showScreen('home');
    expect(location.hash).toBe('');
  });

  it('"Chơi" link on the lobby switches to home without reloading', async () => {
    await boot('/index.html#tournaments');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('.pnav__links a[data-tab="lobby"]').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(visible()).toEqual(['screen-home']);
  });

  it('old section tabs and topnav are gone', async () => {
    await boot();
    expect(document.querySelector('.section-tabs')).toBeNull();
    expect(document.querySelector('.topnav')).toBeNull();
  });

  it('fetches /api/home only on the home screen', async () => {
    await boot('/index.html#rooms');
    expect(global.fetch.mock.calls.some((c) => c[0] === '/api/home')).toBe(false);
    window.__home.showScreen('home');
    expect(global.fetch.mock.calls.some((c) => c[0] === '/api/home')).toBe(true);
  });
});

describe('dashboard rendering', () => {
  const DATA = {
    myGame: { roomId: 'R1', roomName: 'x', state: 'playing', opponent: '<img src=x onerror=alert(1)>', myTurn: true,
      winningRule: 'caro', timerMode: 'blitz', timerSeconds: 300, timerIncrementSeconds: 3 },
    myMatches: [{ tournamentId: 't 1', tournamentName: 'Sat', pairingId: 'p', roundIndex: 2, opponent: 'Bob', state: 'Ready' }],
    tournaments: [
      { tournamentId: 't1', name: 'Sat', format: 'swiss', status: 'active', playerCount: 64, registered: true },
      { tournamentId: 't2', name: 'Oct', format: 'swiss', status: 'draft', playerCount: 3, registered: false },
    ],
    live: [{ roomId: 'L1', black: 'kim', white: 'sak', viewers: 120, boardSize: 15, moves: 42,
      winningRule: 'freestyle', timerMode: 'per_move', timerSeconds: 30 }],
  };

  it('my game row: opponent as text, rule line, your-turn meta; click joins the room', async () => {
    await boot('/index.html', DATA);
    const rows = document.querySelectorAll('#home-mine .prow');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('img')).toBeNull();
    expect(rows[0].querySelector('.prow__t').textContent)
      .toBe('home.vs{"name":"<img src=x onerror=alert(1)>"}');
    expect(segs(rows[0])).toEqual(['rankings.cat_caro', '5+3', 'home.your_turn']);
    rows[0].click();
    expect(window.joinRoom).toHaveBeenCalledWith('R1');
  });

  it('tournament match row: round is 1-based, state label, links to the tournament', async () => {
    await boot('/index.html', DATA);
    const row = document.querySelectorAll('#home-mine .prow')[1];
    expect(row.querySelector('.prow__t').textContent).toBe('Sat');
    expect(segs(row)).toEqual(['home.round{"n":3}', 'home.vs{"name":"Bob"}', 'home.match_Ready']);
    expect(row.querySelector('.hbullet.on')).not.toBeNull();
  });

  it('#366 scoreboard: online / searching / playing as digit plates (textContent = number), labels name the count, one live game (click watches); dashes without stats', async () => {
    const num = (id) => document.getElementById(id).textContent;
    const lbl = (id) => [...document.querySelectorAll('#' + id + ' > span')].map((s) => s.textContent);
    const cls = (id, c) => document.getElementById(id).classList.contains(c);
    await boot('/index.html', { ...DATA, stats: { online: 12, playing: 3, searching: 2 }, queueEta: { 'freestyle|auto': 20 } });
    expect([num('home-n-online'), num('home-n-search'), num('home-n-live')]).toEqual(['12', '2', '3']);
    expect([document.getElementById('home-online').hidden, document.getElementById('home-online').textContent]).toEqual([false, 'home.online{"n":12}']); // phone tag
    expect([...document.querySelectorAll('#home-n-online > i')].map((i) => i.textContent)).toEqual(['1', '2']);
    expect([cls('home-n-online', 'is-1'), cls('home-n-search', 'is-1')]).toEqual([false, true]); // 1 digit → CSS "0" plate
    expect(lbl('home-n-search-l')).toEqual(['home.pulse_searching', 'home.eta_short{"s":20}']);
    expect(lbl('home-n-live-l')).toEqual(['home.pulse_playing']);
    const live = document.querySelector('#home-live-one .hq-live');
    expect([live.querySelector('.hq-live__t').textContent, live.querySelector('.hq-live__m').textContent]).toEqual(['kim vs sak', 'home.moves{"n":42}']);
    live.click();
    expect(window.joinRoom).toHaveBeenCalledWith('L1');
    await boot('/index.html', { ...EMPTY, stats: { online: 5, playing: 0, searching: 0 }, queueEta: { 'freestyle|auto': 20 } }); // #292: zero counts dimmed, label kept, no ETA
    expect(['home-n-online', 'home-n-search', 'home-n-live'].map((id) => cls(id, 'is-zero'))).toEqual([false, true, true]);
    expect([lbl('home-n-search-l'), lbl('home-n-live-l')]).toEqual([['home.pulse_searching'], ['home.pulse_playing']]);
    expect(document.getElementById('home-live-one').children).toHaveLength(0);
    await boot('/index.html', DATA);
    expect([num('home-n-online'), num('home-n-search'), num('home-n-live')]).toEqual(['–', '–', '–']);
    expect(document.getElementById('home-online').hidden).toBe(true);
  });
  it('no game to resume → the resume card stays hidden; the empty payload renders without throwing', async () => {
    await boot('/index.html', EMPTY);
    expect(document.getElementById('home-mine-card').hidden).toBe(true);
    await boot('/index.html', { ...EMPTY, myGame: { roomId: 'R', roomName: 'x', state: 'idle', opponent: null, myTurn: false } });
    expect(document.getElementById('home-mine-card').hidden).toBe(false);
  });

  it('fetch failure on first load still renders (hidden resume card), no throw', async () => {
    await boot('/index.html#rooms');
    global.fetch = jest.fn(() => Promise.reject(new Error('net')));
    window.__home.showScreen('home');
    await flush();
    expect(document.getElementById('home-mine-card').hidden).toBe(true);
  });

  it('waiting room (no opponent) shows the room name and "waiting"', async () => {
    await boot('/index.html', { ...EMPTY, myGame: { roomId: 'R', roomName: 'My room', state: 'idle', opponent: null, myTurn: false } });
    const row = document.querySelector('#home-mine .prow');
    expect(row.querySelector('.prow__t').textContent).toBe('My room');
    expect(row.querySelector('.prow__m').textContent).toBe('home.waiting');
  });
});

describe('news, forum, learn, about (#224)', () => {
  const XSS = '<img src=x onerror=alert(1)>';
  const FORUM = [
    { id: 't 1', title: XSS, category: 'tactics', replyCount: 3, lastPostAt: '2026-10-10T00:00:00Z', author: 'Kim' },
    { id: 't2', title: 'Two', category: 'general', replyCount: 0, lastPostAt: '2026-10-09T00:00:00Z', author: 'Sak' },
  ];

  it('news line: text via textContent, link only for same-site paths, hidden when empty/null', async () => {
    await boot('/index.html', { ...EMPTY, news: [{ id: 'n', body: XSS, link: '/forum/t/abc' }] });
    const box = document.getElementById('home-news');
    expect(box.hidden).toBe(false);
    expect(box.querySelector('img')).toBeNull();
    const a = box.querySelector('a.hnews__line');
    expect(a.getAttribute('href')).toBe('/forum/t/abc');
    expect(a.querySelector('.hnews__body').textContent).toBe(XSS);

    for (const link of ['//evil.example', 'javascript:alert(1)', 'https://x.example', null]) {
      await boot('/index.html', { ...EMPTY, news: [{ id: 'n', body: 'Hi', link }] });
      expect(document.querySelector('#home-news a')).toBeNull();
      expect(document.querySelector('#home-news p.hnews__line .hnews__body').textContent).toBe('Hi');
    }
    for (const news of [null, [], [{ id: 'n', body: '' }]]) {
      await boot('/index.html', { ...EMPTY, news });
      expect(document.getElementById('home-news').hidden).toBe(true);
    }
    await boot('/index.html', EMPTY); // older payload without the key
    expect(document.getElementById('home-news').hidden).toBe(true);
  });

  it('no About block on the home page', async () => {
    await boot('/index.html', EMPTY);
    expect(document.getElementById('home-about')).toBeNull();
  });
});

describe('ruleLine()', () => {
  // B196: only blitz carries an increment (TimerManager); per_game is a bare total.
  it.each([
    [{ winningRule: 'caro', timerMode: 'blitz', timerSeconds: 300, timerIncrementSeconds: 3 }, 'rankings.cat_caro · 5+3'],
    [{ winningRule: 'caro', timerMode: 'blitz', timerSeconds: 600, timerIncrementSeconds: 0 }, 'rankings.cat_caro · 10+0'],
    [{ winningRule: 'caro', timerMode: 'blitz', timerSeconds: 30, timerIncrementSeconds: 2 }, 'rankings.cat_caro · 30s+2'],
    [{ winningRule: 'caro', timerMode: 'per_game', timerSeconds: 600, timerIncrementSeconds: 5 }, 'rankings.cat_caro · home.per_game{"m":10}'],
    [{ winningRule: 'caro', timerMode: 'per_game', timerSeconds: 90 }, 'rankings.cat_caro · home.per_game_s{"s":90}'],
    [{ winningRule: 'standard', timerMode: 'per_move', timerSeconds: 20 }, 'rankings.cat_standard · home.per_move{"s":20}'],
    [{ winningRule: 'freestyle', timerMode: 'none' }, 'rankings.cat_freestyle'],
    [{}, ''],
  ])('%j → %s', async (r, out) => {
    await boot('/index.html#rooms');
    expect(window.__home.ruleLine(r)).toBe(out);
  });
});

/** #358 M4 helpers: the quick-match options are the blanks of the #home-q sentence, chosen in the #qm-pick listbox. */
const blank = (k) => document.querySelector('#home-q [data-blank="' + k + '"]');
const opts = () => [...document.querySelectorAll('#qm-pick [role="option"]')];
const optTexts = (k) => { blank(k).click(); const r = opts().map((o) => o.textContent); document.body.click(); return r; };
const chosen = (k) => { blank(k).click(); const r = opts().filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent); document.body.click(); return r; };
const pick = (k, text) => { blank(k).click(); opts().find((o) => o.textContent === text).click(); };
const key = (node, k) => node.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('home M4 "Câu lệnh" (#358)', () => {
  it('shape: greeting row, news, resume strip, sentence + Chơi nhanh + room code, count cards', async () => {
    await boot('/index.html', EMPTY, { userId: 'u', isGuest: false, displayName: 'Me' });
    const home = document.getElementById('screen-home');
    expect([...home.children].map((n) => n.id || n.className)).toEqual(['home-lamp', 'hq-hello', 'hl-title', 'home-news', 'home-mine-card', 'hq-main', 'home-live-card', 'home-stats']); // #418 adds the phone live card
    expect(home.getAttribute('aria-labelledby')).toBe('home-q');
    expect(document.getElementById('home-q').tagName).toBe('H1');
    expect(document.getElementById('home-hello').textContent).toBe('home.hello{"name":"Me"}');
    expect(['rule', 'time', 'mode'].map((k) => [blank(k).getAttribute('aria-haspopup'), blank(k).getAttribute('aria-expanded')]))
      .toEqual([['listbox', 'false'], ['listbox', 'false'], ['listbox', 'false']]);
    expect(document.getElementById('qm-pick').hidden).toBe(true);
    expect(document.querySelector('#home-code').querySelectorAll('input.hq-code__box')).toHaveLength(3);
    expect(document.querySelectorAll('.hub-btn, #qm-menu, #qm-menu-btn, .hstats')).toHaveLength(0);
  });

  it('guest greeting has no name', async () => {
    await boot('/index.html', EMPTY, { userId: 'g', isGuest: true, displayName: 'Khách 1' });
    expect(document.getElementById('home-hello').textContent).toBe('home.hello_anon');
  });

  it('"Xem phòng đang mở" goes to the rooms screen', async () => {
    await boot('/index.html', EMPTY);
    document.getElementById('hub-rooms').click();
    expect(visible()).toEqual(['panel-tables']);
  });

  it('#366 secondary features: 4 labelled chips under the scoreboard (desktop right column), no icon-only links left', async () => {
    await boot('/index.html', EMPTY);
    const links = [...document.querySelectorAll('#home-stats .hub-more a.hq-chip')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/puzzles', '/forum', '/index.html#tournaments', '/clubs.html']);
    expect(links.map((a) => a.querySelector('span').dataset.i18n)).toEqual(['shell.learn', 'home.forum', 'tabs.tournaments', 'lobby.clubs']);
    expect(document.querySelectorAll('.hq-hello nav, .hub-ico')).toHaveLength(0);
    expect(document.querySelector('#home-stats .hub-more').previousElementSibling.classList.contains('hq-board')).toBe(true);
  });

  it('a blank opens the listbox: selected option focused, arrows rove, Enter picks; Escape closes and returns focus; outside click closes', async () => {
    await boot('/index.html', EMPTY, { userId: 'u', isGuest: false, displayName: 'Me' });
    const list = document.getElementById('qm-pick');
    blank('time').click();
    expect([list.hidden, list.getAttribute('role'), list.getAttribute('aria-label'), blank('time').getAttribute('aria-expanded')]).toEqual([false, 'listbox', 'qm.pick_time', 'true']);
    expect(document.activeElement.textContent).toBe('qm.time_auto');
    expect(opts().map((o) => o.tabIndex)).toEqual([0, -1, -1, -1]);
    key(document.activeElement, 'ArrowDown');
    key(document.activeElement, 'ArrowDown');
    expect(opts().map((o) => o.tabIndex)).toEqual([-1, -1, 0, -1]);
    key(document.activeElement, 'Enter');
    expect([list.hidden, blank('time').textContent, document.activeElement]).toEqual([true, 'home.per_move{"s":"30"}', blank('time')]);
    blank('rule').click();
    key(document.activeElement, 'End');
    key(document.activeElement, 'Escape');
    expect([list.hidden, blank('rule').textContent, document.activeElement]).toEqual([true, 'rankings.cat_freestyle (room.rule_wall)', blank('rule')]);
    blank('mode').click();
    document.body.click();
    expect([list.hidden, blank('mode').getAttribute('aria-expanded')]).toEqual([true, 'false']);
  });
});

describe('quick match panel (B197)', () => {
  const MEMBER = { userId: 'u1', isGuest: false, displayName: 'Me' };
  const GUEST = { userId: 'g1', isGuest: true, displayName: 'G' };
  const client = () => window.__lobbyStub.client;
  const buttons = () => [...document.querySelectorAll('#qm-actions button')].map((b) => b.textContent);
  const blanks = () => ['rule', 'time', 'mode'].map((k) => blank(k).textContent);

  it('member: 2 rules, Auto + 45s/30s/1+1, rated|casual; sentence reads Luật 1 (Ô khoá) · auto · rated by default; Thách đấu shown', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    expect(optTexts('rule')).toEqual(['rankings.cat_freestyle', 'rankings.cat_freestyle (room.rule_wall)', 'rankings.cat_caro', 'rankings.cat_caro (room.rule_wall)']);
    expect(optTexts('time')).toEqual(['qm.time_auto', 'home.per_move{"s":"45"}', 'home.per_move{"s":"30"}', '1+1']);
    expect(optTexts('mode')).toEqual(['qm.find_rated', 'qm.find_casual']);
    expect(blanks()).toEqual(['rankings.cat_freestyle (room.rule_wall)', 'qm.blank_time_auto', 'qm.blank_rated']);
    expect(document.getElementById('qm-challenge').hidden).toBe(false);
    expect(document.getElementById('qm-friend')).toBeNull(); // #361: the grey "Thách bạn bè" link is replaced
    expect(buttons()).toEqual([]); // idle: the one Chơi nhanh button is the action
  });

  it('guest: casual only (play sends rated:false), mode is fixed text not a control, no Thách đấu, reason + login link under the button', async () => {
    await boot('/index.html', EMPTY, GUEST);
    expect(blank('mode')).toBeNull();
    expect(document.querySelector('#home-q .hq-blank--fixed').textContent).toBe('qm.blank_casual');
    expect(document.getElementById('qm-challenge').hidden).toBe(true);
    document.getElementById('qm-play').click();
    expect(client().emitted.pop()[1]).toMatchObject({ rated: false });
    expect(document.querySelector('#qm-line .qm-line__note').textContent).toBe('qm.guest_casual_only — qm.guest_login_rated');
    // ui-audit home F2: "log in" is a real link, not plain text
    expect(document.querySelector('#qm-line .qm-line__note a.qm-line__login').getAttribute('href')).toBe('/login.html');
  });

  it('picking blanks changes the request and is remembered; a saved choice is restored', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    pick('rule', 'rankings.cat_freestyle (room.rule_wall)');
    pick('time', '1+1');
    document.getElementById('qm-play').click();
    expect(client().emitted.pop()).toEqual(['match:join', { rule: 'freestyle', time: '1+1', rated: true, wall: true, portal: false }]);
    pick('mode', 'qm.find_casual');
    document.getElementById('qm-play').click();
    expect(client().emitted.pop()[1]).toMatchObject({ rated: false });
    expect(JSON.parse(localStorage.getItem('gvn_quickmatch'))).toEqual({ rule: 'freestyle', time: '1+1', wall: true, portal: false, rated: false });
    await boot('/index.html', EMPTY, MEMBER, { saved: { rule: 'freestyle', time: '10+0', rated: false } });
    // a saved clock outside the Home menu stays visible and selected, nothing silently changes
    expect([chosen('rule'), chosen('time'), chosen('mode')]).toEqual([['rankings.cat_freestyle (room.rule_wall)'], ['10+0'], ['qm.find_casual']]);
    expect(blanks()).toEqual(['rankings.cat_freestyle (room.rule_wall)', '10+0', 'qm.blank_casual']);
  });

  it('Ô khoá rides the rule blank: "(Ô khoá)" only when walls are on; the pick sets rule + wall and is remembered', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    pick('rule', 'rankings.cat_freestyle');
    expect(blank('rule').textContent).toBe('rankings.cat_freestyle');
    expect(chosen('rule')).toEqual(['rankings.cat_freestyle']);
    document.getElementById('qm-play').click();
    expect(client().emitted.pop()[1]).toMatchObject({ rule: 'freestyle', wall: false });
    expect(JSON.parse(localStorage.getItem('gvn_quickmatch'))).toMatchObject({ rule: 'freestyle', wall: false });
    await boot('/index.html', EMPTY, MEMBER, { saved: { rule: 'freestyle', time: 'auto', wall: false, rated: true } });
    expect(blank('rule').textContent).toBe('rankings.cat_freestyle');
    pick('rule', 'rankings.cat_freestyle (room.rule_wall)');
    expect(blank('rule').textContent).toBe('rankings.cat_freestyle (room.rule_wall)');
    document.getElementById('qm-play').click();
    expect(client().emitted.pop()[1]).toMatchObject({ rule: 'freestyle', wall: true });
  });

  it('a bogus saved choice falls back to the defaults', async () => {
    await boot('/index.html', EMPTY, MEMBER, { saved: { rule: 'renju', time: '2+1' } });
    expect([chosen('rule'), chosen('time')]).toEqual([['rankings.cat_freestyle (room.rule_wall)'], ['qm.time_auto']]);
  });

  it('searching: the pill replaces Chơi nhanh in place (elapsed + queue, Huỷ tìm), blanks lock; cancel emits match:leave', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    client().fire('match:status', { waiting: true, inBucket: 3, rated: true });
    expect(['rule', 'time', 'mode'].every((k) => blank(k).disabled)).toBe(true);
    expect([document.getElementById('qm-play').hidden, document.getElementById('qm-search').hidden]).toEqual([true, false]);
    expect(buttons()).toEqual(['qm.cancel']);
    expect(document.getElementById('qm-status').textContent).toBe('qm.searching_rated{"t":"0:00"}qm.in_queue{"n":3}');
    expect(document.querySelectorAll('#qm-status span')).toHaveLength(2); // spans, no "·" string
    expect(document.getElementById('qm-line').textContent).toBe('');
    document.querySelector('#qm-actions button').click();
    expect(client().emitted.pop()).toEqual(['match:leave', undefined]);
    client().fire('match:status', { waiting: false });
    expect(buttons()).toEqual([]);
    expect([document.getElementById('qm-play').hidden, document.getElementById('qm-play').disabled, document.getElementById('qm-search').hidden]).toEqual([false, false, true]);
    expect(['rule', 'time', 'mode'].some((k) => blank(k).disabled)).toBe(false);
  });

  it('searching closes an open listbox', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    blank('rule').click();
    client().fire('match:status', { waiting: true, inBucket: 1 });
    expect(document.getElementById('qm-pick').hidden).toBe(true);
  });

  it('alone in the bucket → no queue count', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    client().fire('match:status', { waiting: true, inBucket: 1, rated: false });
    expect(document.getElementById('qm-status').textContent).toBe('qm.searching_casual{"t":"0:00"}');
  });

  it('match:error shows the translated code and unlocks', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    client().fire('match:status', { waiting: true, inBucket: 1 });
    client().fire('match:error', { code: 'ALREADY_IN_ANOTHER_ROOM', message: 'x' });
    expect(document.getElementById('qm-line').textContent).toBe('err.already_in_another_room');
    expect(buttons()).toEqual([]);
  });

  it('match:found → "entering the room" (lobby.js follows room:joined)', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    client().fire('match:status', { waiting: true, inBucket: 2 });
    client().fire('match:found', { roomId: 'R' });
    expect(document.getElementById('qm-status').textContent).toBe('qm.found');
  });
});

describe('Vào phòng bằng mã on Home (#358)', () => {
  const boxes = () => [...document.querySelectorAll('#home-code .hq-code__box')];
  const type = (i, v) => { boxes()[i].value = v; boxes()[i].dispatchEvent(new Event('input')); };
  const submit = () => document.getElementById('home-code').dispatchEvent(new Event('submit', { cancelable: true }));
  const err = () => document.getElementById('home-code-error');

  it('typing advances, upper-cases; Backspace on an empty box clears the previous one', async () => {
    await boot('/index.html', EMPTY);
    boxes()[0].focus();
    type(0, 'a');
    expect([boxes()[0].value, document.activeElement]).toEqual(['A', boxes()[1]]);
    type(1, '3');
    key(boxes()[2], 'Backspace');
    expect([boxes()[1].value, document.activeElement]).toEqual(['', boxes()[1]]);
  });

  it('pasting "#a3f" fills all three boxes', async () => {
    await boot('/index.html', EMPTY);
    const e = new Event('paste', { cancelable: true, bubbles: true });
    e.clipboardData = { getData: () => '#a3f' };
    boxes()[0].dispatchEvent(e);
    expect(boxes().map((b) => b.value)).toEqual(['A', '3', 'F']);
    submit();
    expect(window.joinRoom).toHaveBeenCalledWith('#A3F');
  });

  it('an invalid or incomplete code shows the rooms-form error and joins nothing; typing clears it', async () => {
    await boot('/index.html', EMPTY);
    type(0, 'a'); type(1, '0'); type(2, 'f'); // 0 is never generated
    submit();
    expect([window.joinRoom.mock.calls.length, err().hidden, err().textContent]).toEqual([0, false, 'lobby.join_code_invalid']);
    type(1, '3');
    expect(err().hidden).toBe(true);
    boxes()[2].value = '';
    submit();
    expect([err().hidden, document.activeElement]).toEqual([false, boxes()[2]]);
  });
});

describe('quick-match waiting count (B210)', () => {
  const MEMBER2 = { userId: 'u1', isGuest: false, displayName: 'Me' };
  const line = () => document.getElementById('qm-line').textContent;

  it('"N đang chờ" for the selected rule|time comes with /api/home; none waiting → no suffix', async () => {
    await boot('/index.html', { ...EMPTY, queue: { 'caro|5+3': 214, 'caro|1+0': 3 } }, MEMBER2, { saved: { rule: 'caro', time: '5+3' } });
    await flush();
    expect(line()).toContain('qm.in_queue{"n":214}');
    await boot('/index.html', { ...EMPTY, queue: { 'standard|10+0': 9 } }, MEMBER2, { saved: { rule: 'caro', time: '5+3' } });
    await flush();
    expect(line()).not.toContain('qm.in_queue');
  });

  it('"ước tính N giây" shows only when the server sent an estimate for the selected rule|time', async () => {
    await boot('/index.html', { ...EMPTY, queue: {}, queueEta: { 'caro|5+3': 8, 'caro|1+0': 2 } }, MEMBER2, { saved: { rule: 'caro', time: '5+3' } });
    await flush();
    expect(line()).toContain('qm.eta{"s":8}');
    await boot('/index.html', { ...EMPTY, queue: {}, queueEta: { 'standard|10+0': 8 } }, MEMBER2, { saved: { rule: 'caro', time: '5+3' } });
    await flush();
    expect(line()).not.toContain('qm.eta');
  });

  it('count adds auto waiters; an auto pick counts every clock of the rule', async () => {
    await boot('/index.html', { ...EMPTY, queue: { 'freestyle|5+3': 4, 'freestyle|auto': 2, 'freestyle|1+1': 3, 'standard|auto': 9 } }, MEMBER2);
    await flush();
    expect(line()).toContain('qm.in_queue{"n":9}'); // auto: 4 + 2 + 3
    pick('time', '1+1');
    expect(line()).toContain('qm.in_queue{"n":5}'); // 1+1: 3 + auto 2
  });

  it('changing the chip re-reads the count for the new rule|time', async () => {
    await boot('/index.html', { ...EMPTY, queue: { 'freestyle|5+3': 214, 'freestyle|1+1': 3 } }, MEMBER2);
    await flush();
    pick('time', '1+1');
    expect(line()).toContain('qm.in_queue{"n":3}');
  });
});

describe('Vào bằng mã (Phòng screen, B210 → #364 hero boxes)', () => {
  const $ = (id) => document.getElementById(id);
  const boxes = () => [...$('join-code-form').querySelectorAll('.rh-code__box')];
  const submit = (value) => {
    boxes().forEach((b, i) => { b.value = value[i] || ''; });
    $('join-code-form').dispatchEvent(new Event('submit', { cancelable: true }));
  };

  it('#364: the code form sits open in the Phòng hero (3 boxes, no toggle); the only create entry is the grid card #btn-create', async () => {
    await boot('/index.html#rooms', EMPTY, null);
    expect($('join-code-form').hidden).toBe(false);
    expect(boxes()).toHaveLength(3);
    expect($('btn-join-code').type).toBe('submit');
    expect($('btn-create').classList.contains('rcard-new')).toBe(true);
    expect($('btn-create').closest('#room-list')).not.toBeNull();
    expect(document.querySelector('.rh').textContent).not.toContain('Tạo phòng');
  });

  it('#364: pasting "#a3f" into the first box fills all three', async () => {
    await boot('/index.html#rooms', EMPTY, null);
    const ev = new Event('paste', { cancelable: true });
    ev.clipboardData = { getData: () => '#a3f' };
    boxes()[0].dispatchEvent(ev);
    expect(boxes().map((b) => b.value)).toEqual(['A', '3', 'F']);
  });

  it('parseRoomCode accepts "#a3f", "a3f", " A3F " and rejects ambiguous / wrong-length codes', async () => {
    await boot('/index.html#rooms', EMPTY, null);
    const { parseRoomCode } = window.__home;
    expect(['#a3f', 'a3f', ' A3F ', '#A3F'].map(parseRoomCode)).toEqual(['#A3F', '#A3F', '#A3F', '#A3F']);
    for (const bad of ['', 'A3', 'A3FF', 'A0F', 'A1F', 'AIF', 'AOF', '#', 'A F', null, undefined]) expect(parseRoomCode(bad)).toBeNull();
  });

  it('valid code joins that room; invalid code shows an error and joins nothing', async () => {
    await boot('/index.html#rooms', EMPTY, null);
    submit('a0f'); // 0 is never generated
    expect(window.joinRoom).not.toHaveBeenCalled();
    expect($('join-code-error').hidden).toBe(false);
    expect($('join-code-error').textContent).toBe('lobby.join_code_invalid');
    boxes()[0].dispatchEvent(new Event('input'));
    expect($('join-code-error').hidden).toBe(true);
    submit('a3f');
    expect(window.joinRoom).toHaveBeenCalledWith('#A3F');
  });

  it('home: Thách đấu (twin of Chơi nhanh) for members only — hidden for guests (#361)', async () => {
    await boot('/index.html', EMPTY, { userId: 'u', isGuest: false, displayName: 'Z' });
    expect($('qm-challenge').hidden).toBe(false);
    expect($('qm-challenge').closest('.hq-go')).toBe($('qm-play').parentElement);
    await boot('/index.html', EMPTY, { userId: 'g', isGuest: true, displayName: 'G' });
    expect($('qm-challenge').hidden).toBe(true);
  });
});

describe('live push (B225)', () => {
  const subs = () => window.__lobbyStub.client.emitted.map(([ev]) => ev).filter((ev) => ev.startsWith('home:'));
  const nums = () => ['home-n-online', 'home-n-search', 'home-n-live'].map((id) => document.getElementById(id).textContent);
  const setHidden = (v) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => v }); document.dispatchEvent(new Event('visibilitychange')); };
  afterEach(() => { delete document.hidden; });

  it('home screen subscribes once; leaving it unsubscribes; coming back resubscribes', async () => {
    await boot('/index.html');
    expect(subs()).toEqual(['home:subscribe']);
    window.__home.showScreen('rooms');
    window.__home.showScreen('tournaments');
    window.__home.showScreen('home');
    expect(subs()).toEqual(['home:subscribe', 'home:unsubscribe', 'home:subscribe']);
  });

  it('starting on #rooms never subscribes', async () => {
    await boot('/index.html#rooms');
    expect(subs()).toEqual([]);
  });

  it('home:stats redraws the strip with the pushed absolute values', async () => {
    await boot('/index.html', { ...EMPTY, stats: { online: 1, playing: 0, searching: 0 } });
    window.__lobbyStub.client.fire('home:stats', { online: 7, playing: 2, searching: 1 });
    expect(nums()).toEqual(['7', '1', '2']);
  });

  it('hidden tab unsubscribes; visible again resubscribes and refetches', async () => {
    await boot('/index.html');
    setHidden(true);
    expect(subs()).toEqual(['home:subscribe', 'home:unsubscribe']);
    fetch.mockClear();
    setHidden(false);
    expect(subs()).toEqual(['home:subscribe', 'home:unsubscribe', 'home:subscribe']);
    expect(fetch).toHaveBeenCalledWith('/api/home', expect.anything());
  });

  it('socket reconnect resubscribes and refetches /api/home', async () => {
    await boot('/index.html');
    fetch.mockClear();
    window.__lobbyStub.client.fire('connect'); // still subscribed → no-op
    expect(subs()).toEqual(['home:subscribe']);
    window.__lobbyStub.client.fire('disconnect');
    window.__lobbyStub.client.fire('connect');
    expect(subs()).toEqual(['home:subscribe', 'home:subscribe']);
    expect(fetch).toHaveBeenCalledWith('/api/home', expect.anything());
  });

  describe('lobby room only on the rooms screen (B229)', () => {
    const lsubs = () => window.__lobbyStub.client.emitted.map(([ev]) => ev).filter((ev) => ev.startsWith('lobby:'));

    it('subscribes entering rooms, unsubscribes leaving; dashboard/tournaments never join', async () => {
      await boot('/index.html');
      expect(lsubs()).toEqual([]);
      window.__home.showScreen('rooms');
      window.__home.showScreen('tournaments');
      window.__home.showScreen('rooms');
      window.__home.showScreen('home');
      expect(lsubs()).toEqual(['lobby:subscribe', 'lobby:unsubscribe', 'lobby:subscribe', 'lobby:unsubscribe']);
    });

    it('starting on #rooms subscribes once', async () => {
      await boot('/index.html#rooms');
      expect(lsubs()).toEqual(['lobby:subscribe']);
    });

    it('hidden tab leaves, visible rejoins; reconnect rejoins only on rooms', async () => {
      await boot('/index.html#rooms');
      setHidden(true);
      setHidden(false);
      expect(lsubs()).toEqual(['lobby:subscribe', 'lobby:unsubscribe', 'lobby:subscribe']);
      const c = window.__lobbyStub.client;
      c.fire('disconnect'); c.fire('connect');
      expect(lsubs()).toHaveLength(4);
      window.__home.showScreen('home');
      c.fire('disconnect'); c.fire('connect');
      expect(lsubs().filter((e) => e === 'lobby:subscribe')).toHaveLength(3);
    });
  });
});

describe('#361 Thách đấu on Home', () => {
  const MEMBER = { userId: 'u1', isGuest: false, displayName: 'Me' };
  const $ = (id) => document.getElementById(id);
  const ok = (body, status = 200) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });
  const FRIENDS = [{ username: 'lan', displayName: 'Lan Anh', avatarUrl: null, online: true }, { username: 'quang', displayName: 'Quang', avatarUrl: null, online: false }];
  const ONLINE = [{ userId: 'k', username: 'khanh', displayName: 'Khánh', avatarUrl: null }, { userId: 'l', username: 'lan', displayName: 'Lan Anh', avatarUrl: null }];
  let posts;
  const api = (postReply = ok({ id: 'c1', rule: 'caro', games: 1, stake: 'none' }, 201)) => (u, init) => { // real reply shape: no `to`
    if (u === '/api/friends') return ok({ friends: FRIENDS });
    if (u === '/api/challenges/online') return ok({ players: ONLINE });
    if (u === '/api/challenges' && init && init.method === 'POST') { posts.push(JSON.parse(init.body)); return postReply; }
    return null;
  };
  const rows = () => [...document.querySelectorAll('#home-ch .hch__row')].map((r) => [r.dataset.u, !!r.querySelector('.hch__tag'), r.querySelector('.hch__av').classList.contains('is-on')]);
  const tab = (k) => document.querySelector(`#home-ch .hch__tab[data-tab="${k}"]`).click();
  const openPicker = async () => { $('qm-challenge').click(); await flush(); await flush(); };
  beforeEach(() => { posts = []; });

  it('opens a picker merging friends (online first) + online players by username; tabs filter; search filters', async () => {
    await boot('/index.html', EMPTY, MEMBER, { api: api() });
    await openPicker();
    expect($('qm-challenge').getAttribute('aria-expanded')).toBe('true');
    expect($('home-ch').classList.contains('hch--sheet')).toBe(false); // jsdom: 768px tall, button at 0 → popover
    expect($('home-ch').style.getPropertyValue('--ch-max')).toMatch(/^\d+px$/); // capped to the viewport (home doesn't scroll)
    expect(document.activeElement).toBe(document.querySelector('#home-ch .hch__search'));
    expect(rows()).toEqual([['lan', true, true], ['quang', true, false], ['khanh', false, true]]); // Lan once, tagged + online
    tab('friends');
    expect(rows().map((r) => r[0])).toEqual(['lan', 'quang']);
    tab('online');
    expect(rows().map((r) => r[0])).toEqual(['lan', 'khanh']);
    tab('all');
    const q = document.querySelector('#home-ch .hch__search');
    q.value = 'KHÁ'; q.dispatchEvent(new Event('input'));
    expect(rows().map((r) => r[0])).toEqual(['khanh']);
    q.value = 'zzz'; q.dispatchEvent(new Event('input'));
    expect([rows(), document.querySelector('#home-ch .hch__note').textContent]).toEqual([[], 'challenge.no_match']);
  });

  it('shows the sentence rules; send is disabled until a pick; sends one game with the sentence settings; notice in #qm-line', async () => {
    await boot('/index.html', EMPTY, MEMBER, { api: api(), saved: { rule: 'freestyle', time: 'm45', rated: false, wall: false, portal: true } });
    await openPicker();
    expect([...document.querySelectorAll('#home-ch .hch__rules .rtag')].map((n) => n.textContent))
      .toEqual(['rankings.cat_freestyle', 'home.per_move{"s":"45"}', 'qm.find_casual']);
    const send = document.querySelector('#home-ch .hch__send');
    expect([send.disabled, send.textContent]).toEqual([true, 'home.ch_pick']);
    document.querySelector('#home-ch .hch__row[data-u="khanh"]').click();
    expect([send.disabled, send.textContent]).toEqual([false, 'home.ch_send{"name":"Khánh"}']);
    send.click();
    await flush(); await flush();
    expect(posts).toEqual([{ to: 'khanh', games: 1, stake: 'none', settings: {
      boardSize: 17, winningRule: 'freestyle', ranked: false, ruleSwap2: false, ruleWall: false, rulePortal: true,
      timerMode: 'per_move', timerSeconds: 45, timerIncrementSeconds: 0 } }]);
    expect($('home-ch')).toBeNull();
    expect(document.activeElement).toBe($('qm-challenge'));
    expect($('qm-line').textContent).toBe('home.ch_sent{"name":"Khánh"}');
    // the next pick clears the notice
    document.querySelector('#home-q [data-blank="rule"]').click();
    document.querySelector('#qm-pick [role="option"]').click();
    expect($('qm-line').textContent).not.toContain('home.ch_sent');
  });

  it('server refusal (privacy gate) is shown in the picker, which stays open', async () => {
    await boot('/index.html', EMPTY, MEMBER, { api: api(ok({ error: 'Người này không nhận thách đấu từ bạn.', code: 'CHALLENGE_NOT_ALLOWED' }, 403)) });
    await openPicker();
    document.querySelector('#home-ch .hch__row[data-u="lan"]').click();
    document.querySelector('#home-ch .hch__send').click();
    await flush(); await flush();
    expect(document.querySelector('#home-ch .hch__status').textContent).toBe('Người này không nhận thách đấu từ bạn.');
    expect(document.querySelector('#home-ch .hch__send').disabled).toBe(false);
  });

  it.each([
    ['phone width', true, 0, true], ['short window: <460px under the button', false, 400, true], ['room under the button', false, 100, false],
  ])('%s → sheet %s/%s → %s', async (_, phone, bottom, sheet) => {
    await boot('/index.html', EMPTY, MEMBER, { api: api() });
    window.matchMedia = (q) => ({ matches: phone && q.includes('860') });
    $('qm-challenge').getBoundingClientRect = () => ({ top: bottom - 60, bottom, left: 0, right: 200, width: 200, height: 60 });
    await openPicker();
    expect($('home-ch').classList.contains('hch--sheet')).toBe(sheet);
    expect(!!$('home-ch').style.getPropertyValue('--ch-max')).toBe(!sheet);
    delete window.matchMedia;
  });

  it('outside tap: popover closes and the tap goes through; sheet closes and swallows the tap (scrim)', async () => {
    await boot('/index.html', EMPTY, MEMBER, { api: api() });
    const tapPlay = () => { $('qm-play').dispatchEvent(new Event('pointerdown', { bubbles: true })); $('qm-play').click(); };
    await openPicker();
    tapPlay();
    expect([$('home-ch'), window.__lobbyStub.client.emitted.filter(([ev]) => ev === 'match:join').length]).toEqual([null, 1]);
    window.matchMedia = () => ({ matches: true });
    await openPicker();
    expect($('home-ch').classList.contains('hch--sheet')).toBe(true);
    tapPlay();
    expect([$('home-ch'), window.__lobbyStub.client.emitted.filter(([ev]) => ev === 'match:join').length]).toEqual([null, 1]);
    delete window.matchMedia;
  });

  it('Escape closes and returns focus; a second click toggles it closed; searching hides the button and closes the picker', async () => {
    await boot('/index.html', EMPTY, MEMBER, { api: api() });
    await openPicker();
    $('home-ch').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect([$('home-ch'), document.activeElement, $('qm-challenge').getAttribute('aria-expanded')]).toEqual([null, $('qm-challenge'), 'false']);
    await openPicker();
    $('qm-challenge').click();
    expect($('home-ch')).toBeNull();
    await openPicker();
    window.__lobbyStub.client.fire('match:status', { waiting: true, inBucket: 1 });
    expect([$('home-ch'), $('qm-challenge').hidden]).toEqual([null, true]);
    window.__lobbyStub.client.fire('match:status', { waiting: false });
    expect($('qm-challenge').hidden).toBe(false);
  });

  it('"Tuỳ chọn khác" hands the picked player to the full #222 ChallengeModal (focus on Thách đấu when it opens, so Escape returns there)', async () => {
    await boot('/index.html', EMPTY, MEMBER, { api: api() });
    let focusAtOpen = null;
    window.ChallengeModal = { open: jest.fn(() => { focusAtOpen = document.activeElement; }) };
    await openPicker();
    document.querySelector('#home-ch .hch__row[data-u="quang"]').click();
    document.querySelector('#home-ch .hch__more').click();
    expect($('home-ch')).toBeNull();
    expect(focusAtOpen).toBe($('qm-challenge'));
    expect(window.ChallengeModal.open).toHaveBeenCalledWith(expect.objectContaining({ to: { username: 'quang', displayName: 'Quang', avatarUrl: null } }));
    // the modal sends → notice names the picked player
    window.ChallengeModal.open.mock.calls[0][0].onSent({ id: 'c2' });
    expect($('qm-line').textContent).toBe('home.ch_sent{"name":"Quang"}');
    delete window.ChallengeModal;
  });

  it('"Tuỳ chọn khác" with nobody picked opens the modal picker; its send shows a name-less notice', async () => {
    await boot('/index.html', EMPTY, MEMBER, { api: api() });
    window.ChallengeModal = { open: jest.fn() };
    await openPicker();
    document.querySelector('#home-ch .hch__more').click();
    const arg = window.ChallengeModal.open.mock.calls[0][0];
    expect(arg.to).toBeUndefined();
    arg.onSent({ id: 'c3' });
    expect($('qm-line').textContent).toBe('home.ch_sent_any');
    delete window.ChallengeModal;
  });

  it.each([
    ['auto', ['per_move', 60, 0]], ['m30', ['per_move', 30, 0]], ['1+1', ['blitz', 60, 1]], ['5+3', ['blitz', 300, 3]], ['bogus', ['per_move', 60, 0]],
  ])('util.settings: time %s → %j (auto plays the server default m60)', async (time, [timerMode, timerSeconds, timerIncrementSeconds]) => {
    await boot('/index.html', EMPTY, MEMBER);
    expect(window.HomeChallenge.util.settings({ rule: 'caro', time, rated: true, wall: true, portal: false }))
      .toEqual({ boardSize: 17, winningRule: 'caro', ranked: true, ruleSwap2: false, ruleWall: true, rulePortal: false, timerMode, timerSeconds, timerIncrementSeconds });
  });
});

describe('#360 phone links → labelled tiles after the room code', () => {
  it('4 tiles (same hrefs as the desktop chips) sit after #home-code inside .hq-main; same hrefs as the desktop chips', async () => {
    await boot('/index.html');
    const tiles = [...document.querySelectorAll('.hq-tiles a.hq-tile')];
    const icons = [...document.querySelectorAll('#home-stats .hub-more a')];
    expect(tiles.map((a) => a.getAttribute('href'))).toEqual(icons.map((a) => a.getAttribute('href')));
    expect(tiles.map((a) => a.querySelector('span').dataset.i18n)).toEqual(['shell.learn', 'home.forum', 'tabs.tournaments', 'lobby.clubs']);
    const tilesNav = document.querySelector('.hq-tiles');
    expect(tilesNav.parentElement.classList.contains('hq-main')).toBe(true);
    expect(tilesNav.previousElementSibling.id).toBe('home-code');
  });

  it('CSS: tiles hidden by default (desktop) and shown ≤860px (desktop chips live in #home-stats, hidden there)', () => {
    const css = read('css/shell.css');
    expect(css).toMatch(/^body\.zen-lobby \.hq-tiles \{ display: none; \}/m);
    const phone = css.slice(css.indexOf('@media (max-width: 860px)'));
    expect(phone).toMatch(/\.hq-tiles \{ display: grid;/);
  });
});

describe('#362 phone: counts as one status line, links in one card', () => {
  const part = (id) => [...document.getElementById(id).children].map((n) => n.textContent);
  it('line sits right after .hq-go with "–" placeholders before data (B261: no reflow)', async () => {
    await boot('/index.html');
    const p = document.getElementById('home-pulse');
    expect(p.previousElementSibling.id).toBe('home-stats-phone'); // #418: chips + counts sit between (the line itself is hidden on phones now)
    expect(p.querySelectorAll('b')).toHaveLength(2);
    expect([...p.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['–', '–']);
  });

  it('renders the same counts as the cards (no ETA — #qm-line shows it); "M ván đang chơi" links to Phòng', async () => {
    await boot('/index.html', { ...EMPTY, stats: { online: 9, playing: 3, searching: 2 }, queueEta: { 'freestyle|auto': 20 } });
    expect(part('home-pulse-search')).toEqual(['2', 'home.pulse_searching']);
    expect(part('home-pulse-live')).toEqual(['3', 'home.pulse_playing']);
    const live = document.getElementById('home-pulse-live');
    expect(live.getAttribute('href')).toBe('#rooms'); // Phòng lists live games under "Đang chơi" (no Quan sát filter since #364)
  });

  it('zero counts: de-emphasised numbers, the playing part is plain text (no href)', async () => {
    await boot('/index.html', { ...EMPTY, stats: { online: 1, playing: 0, searching: 0 }, queueEta: { 'freestyle|auto': 20 } });
    expect(part('home-pulse-search')).toEqual(['0', 'home.pulse_searching']);
    const live = document.getElementById('home-pulse-live');
    expect(live.hasAttribute('href')).toBe(false);
    expect([...document.querySelectorAll('#home-pulse b')].every((b) => b.classList.contains('is-zero'))).toBe(true);
  });

  it('CSS: line hidden on desktop; ≤860px shows it, hides the count cards, and lays the 4 links in one 4-column card', () => {
    const css = read('css/shell.css');
    expect(css).toMatch(/^body\.zen-lobby \.hq-pulse \{ display: none; \}/m);
    const phone = css.slice(css.indexOf('@media (max-width: 860px)'));
    expect(phone).toMatch(/\.hq > \.hq-side \{ display: none; \}/);
    expect(phone).toMatch(/\.hq-pulse \{ display: flex;/);
    expect(phone).toMatch(/\.hq-tiles \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  });
});

describe('#366 desktop scoreboard vs phone', () => {
  it('CSS: the greeting-row online tag is hidden ≥861px (board shows it); ≤860px still hides #home-stats', () => {
    const css = read('css/shell.css');
    expect(css).toMatch(/@media \(min-width: 861px\) \{ body\.zen-lobby \.hq-online \{ display: none; \} \}/);
    const phone = css.slice(css.indexOf('@media (max-width: 860px)'));
    expect(phone).toMatch(/\.hq > \.hq-side \{ display: none; \}/);
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.hq-board__live i \{ animation: none; \}/);
  });
});

describe('#418 phone hero: chips, counts, live card, news card', () => {
  const member = { userId: 'u', isGuest: false, displayName: 'Me' };
  const chip = (k) => document.querySelector('#home-chips [data-chip="' + k + '"]');
  const LIVE = [
    { roomId: 'L1', black: '<b>kim</b>', white: 'sak', viewers: 120, boardSize: 15, moves: 42 },
    { roomId: 'L2', black: 'an', white: 'binh', viewers: 0, boardSize: 15, moves: 3 },
    { roomId: 'L3', black: null, white: 'x', viewers: 5, boardSize: 15, moves: 1 }, // half-seated: skipped
  ];

  it('body.is-home follows the screen (the transparent nav is scoped to it)', async () => {
    await boot('/index.html');
    expect(document.body.classList.contains('is-home')).toBe(true);
    window.__home.showScreen('rooms');
    expect(document.body.classList.contains('is-home')).toBe(false);
  });

  it('ui/home-phone-create-room: Tạo phòng sits right after Chơi nhanh (chips above), carries data-create-room, locks while searching', async () => {
    await boot('/index.html', EMPTY, member);
    const main = document.querySelector('.hq-main');
    const kids = [...main.children].map((n) => n.id || n.className);
    expect(kids.indexOf('home-chips')).toBeLessThan(kids.indexOf('hq-go'));
    expect(document.querySelector('.hq-go').nextElementSibling.id).toBe('hh-create');
    const create = document.getElementById('hh-create');
    expect(create.hasAttribute('data-create-room')).toBe(true);
    expect(create.id).not.toBe('btn-create');
    expect(create.disabled).toBe(false);
    window.__lobbyStub.client.fire('match:status', { waiting: true, inBucket: 1, rated: true });
    expect(create.disabled).toBe(true);
  });

  it('member: three chip buttons with short labels; Ô khoá adds a lock + full-name title', async () => {
    await boot('/index.html', EMPTY, member);
    expect(['rule', 'time', 'mode'].map((k) => chip(k).querySelector('.hh-chip__t').textContent))
      .toEqual(['rankings.cat_freestyle', 'qm.time_auto', 'home.chip_rated']);
    expect(chip('rule').querySelectorAll('svg')).toHaveLength(2); // rule icon + lock (wall on by default)
    expect(chip('rule').title).toBe('rankings.cat_freestyle (room.rule_wall)');
    expect(['rule', 'time', 'mode'].map((k) => chip(k).getAttribute('aria-haspopup'))).toEqual(['listbox', 'listbox', 'listbox']);
  });

  it('guest: the mode chip is plain text (casual only), not a control', async () => {
    await boot('/index.html');
    expect(chip('mode')).toBeNull();
    const fixed = document.querySelector('#home-chips .hh-chip--fixed');
    expect(fixed.tagName).toBe('SPAN');
    expect(fixed.textContent).toBe('home.chip_casual');
  });

  it('a chip opens the shared #qm-pick; choosing updates both the chip and the sentence', async () => {
    await boot('/index.html', EMPTY, member);
    chip('mode').click();
    expect(document.getElementById('qm-pick').hidden).toBe(false);
    expect(chip('mode').getAttribute('aria-expanded')).toBe('true');
    [...document.querySelectorAll('#qm-pick [role="option"]')].find((o) => o.textContent === 'qm.find_casual').click();
    expect(document.getElementById('qm-pick').hidden).toBe(true);
    expect(chip('mode').querySelector('.hh-chip__t').textContent).toBe('home.chip_casual');
    expect(document.querySelector('#home-q [data-blank="mode"]').textContent).toBe('qm.blank_casual');
    document.getElementById('qm-play').click();
    expect(window.__lobbyStub.client.emitted.find(([ev]) => ev === 'match:join')[1].rated).toBe(false);
  });

  it('chips are disabled while searching', async () => {
    await boot('/index.html', EMPTY, member);
    window.__lobbyStub.client.fire('match:status', { waiting: true, inBucket: 1 });
    expect(['rule', 'time', 'mode'].map((k) => chip(k).disabled)).toEqual([true, true, true]);
  });

  it('counts: "–" before data, then online / searching / playing (0 when missing)', async () => {
    const ids = ['home-s-online', 'home-s-search', 'home-s-live'];
    const text = () => ids.map((id) => document.getElementById(id).textContent);
    expect(BODY).toMatch(/id="home-s-online">–</);
    await boot('/index.html', { ...EMPTY, stats: { online: 128, searching: 9 } });
    expect(text()).toEqual(['128', '9', '0']);
  });

  it('live card: seated games only, names as text, viewers, click spectates; "Xem tất cả" → Phòng', async () => {
    await boot('/index.html', { ...EMPTY, live: LIVE });
    const games = [...document.querySelectorAll('#home-live .hh-game')];
    expect(games).toHaveLength(2);
    expect([...games[0].querySelectorAll('.hh-game__n')].map((n) => n.textContent)).toEqual(['<b>kim</b>', 'sak']);
    expect(games[0].querySelector('b')).toBeNull();
    expect(games.map((g) => g.querySelector('.hh-game__w').textContent)).toEqual(['120', '0']);
    expect(games[0].getAttribute('aria-label')).toBe('home.live_aria{"black":"<b>kim</b>","white":"sak","n":120}');
    expect(games.map((g) => g.querySelector('.hh-mini').className)).toEqual(['hh-mini hh-mini--0', 'hh-mini hh-mini--1']);
    games[1].click();
    expect(window.joinRoom).toHaveBeenCalledWith('L2');
    document.getElementById('home-live-all').click();
    expect(visible()).toEqual(['panel-tables']);
  });

  it('live card: empty state, then follows the home:live push', async () => {
    await boot('/index.html');
    expect(document.querySelector('#home-live .hh-live__empty').textContent).toBe('home.live_empty');
    window.__lobbyStub.client.fire('home:live', LIVE.slice(0, 1));
    expect(document.querySelectorAll('#home-live .hh-game')).toHaveLength(1);
    window.__lobbyStub.client.fire('home:live', null); // odd payload → empty, no throw
    expect(document.querySelector('#home-live .hh-live__empty')).not.toBeNull();
  });

  it('news card: title + day/month of createdAt; a bad date shows no time', async () => {
    await boot('/index.html', { ...EMPTY, news: [{ id: 1, body: 'Giải đấu', link: '/tournament.html', createdAt: '2026-11-15T08:00:00Z' }] });
    expect(document.querySelector('#home-news .hnews__head').textContent).toBe('home.news_title');
    expect(document.querySelector('#home-news time').textContent).toBe('15/11');
    await boot('/index.html', { ...EMPTY, news: [{ id: 1, body: 'x', link: null, createdAt: 'nope' }] });
    expect(document.querySelector('#home-news time')).toBeNull();
  });

  it('#419 news card lists up to 2 items in server order; desktop CSS keeps one line', async () => {
    await boot('/index.html', { ...EMPTY, news: [{ id: 2, body: 'B', link: '/forum' }, { id: 1, body: 'A', link: null }] });
    expect([...document.querySelectorAll('#home-news .hnews__line')].map((l) => [l.tagName, l.querySelector('.hnews__body').textContent])).toEqual([['A', 'B'], ['P', 'A']]);
    expect(document.querySelectorAll('#home-news .hnews__head')).toHaveLength(1);
    expect(read('css/shell.css')).toMatch(/body\.zen-lobby \.hnews__line \+ \.hnews__line \{ display: none; \}/);
    expect(read('css/home-hero.css')).toMatch(/#screen-home \.hnews__line \+ \.hnews__line \{ display: flex;/);
  });

  it('#419 live card: real mini board from thumb (stones, last move); bad/missing thumb → decorative', async () => {
    const cells = '.'.repeat(30) + 'b' + 'w' + '.'.repeat(31);
    const thumb = { x: 3, y: 4, cols: 9, rows: 7, cells, last: 31 };
    await boot('/index.html', { ...EMPTY, live: [{ ...LIVE[0], thumb }, { ...LIVE[1], thumb: { ...thumb, cells: 'bw' } }] });
    const [real, fake] = [...document.querySelectorAll('#home-live .hh-mini')];
    expect(real.getAttribute('class')).toBe('hh-mini hh-mini--real');
    expect(real.getAttribute('aria-hidden')).toBe('true');
    expect(real.getAttribute('viewBox')).toBe('0 0 90 70');
    const stones = [...real.querySelectorAll('.hh-mini__stones circle')].map((s) => [s.getAttribute('class'), s.getAttribute('data-c')]);
    expect(stones).toEqual([['is-b', '30'], ['is-w', '31'], ['is-last', null]]);
    expect(fake.className).toBe('hh-mini hh-mini--1');
  });

  it('#419 mini board: every stone and the last-move ring sit exactly on a grid-line crossing (room-board geometry)', async () => {
    const cells = 'b' + '.'.repeat(7) + 'w' + '.'.repeat(53) + 'b'; // corners + bottom-right
    await boot('/index.html', { ...EMPTY, live: [{ ...LIVE[0], thumb: { x: 0, y: 0, cols: 9, rows: 7, cells, last: 62 } }] });
    const svg = document.querySelector('#home-live .hh-mini--real');
    const d = svg.querySelector('.hh-mini__grid').getAttribute('d');
    const xs = new Set([...d.matchAll(/M([\d.]+) 0V/g)].map((m) => +m[1]));
    const ys = new Set([...d.matchAll(/M0 ([\d.]+)H/g)].map((m) => +m[1]));
    expect([xs.size, ys.size]).toEqual([9, 7]);
    const circles = [...svg.querySelectorAll('.hh-mini__stones circle')];
    expect(circles).toHaveLength(4);
    for (const c of circles) {
      expect(xs.has(+c.getAttribute('cx'))).toBe(true);
      expect(ys.has(+c.getAttribute('cy'))).toBe(true);
      expect(+c.getAttribute('r')).toBeLessThan(5); // smaller than half a cell (10)
    }
    // two boards on one page → distinct gradient ids
    expect(svg.querySelector('radialGradient').id).toMatch(/^hm\d+b$/);
  });

  it('i18n: no key defined twice in a locale (#418 shipped "{a} vs {b}": a later twin silently won)', () => {
    const src = read('js/i18n.js');
    for (const loc of ['vi', 'en']) {
      const start = src.indexOf('\n  ' + loc + ': {');
      const block = src.slice(start, src.indexOf('\n  },', start));
      const keys = [...block.matchAll(/^    '([^']+)':/gm)].map((m) => m[1]);
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
      expect(dupes).toEqual(['home.moves']); // pre-existing twin with identical text — left as is
    }
  });

  it('tab bar active item = --c-tab-on, ≥ 4.5:1 on every skin background (dark + light)', () => {
    expect(read('css/platform-shell.css')).toMatch(/\.ptabbar a\.is-active \{ color: var\(--c-tab-on, var\(--c-strong\)\);/);
    const tokens = read('css/tokens.css');
    const dark = tokens.match(/:root \{ --c-tab-on: (#[0-9a-f]{6}); \}/)[1];
    const light = tokens.match(/:root\[data-mode="light"\] \{ --c-tab-on: (#[0-9a-f]{6}); \}/)[1];
    const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    // every --c-bg of a block: blocks with data-mode="light" (or the arena light block) pair with the light value
    for (const m of tokens.matchAll(/(:root[^{]*)\{[^}]*?--c-bg:\s*(#[0-9a-f]{6})/g)) {
      const isLight = /data-mode="light"/.test(m[1]);
      expect([m[1].trim(), ratio(isLight ? light : dark, m[2]) >= 4.5]).toEqual([m[1].trim(), true]);
    }
  });

  it('CSS: every .hh-* part is hidden on desktop; the photo loads only inside the phone media query', () => {
    const css = read('css/home-hero.css');
    const phoneAt = css.indexOf('@media (max-width: 860px)');
    expect(css.slice(0, phoneAt)).toMatch(/\.hh-title, \.hh-sub, \.hh-chips, \.hh-create, \.hh-stats, \.hh-card, \.hnews__head, \.hnews__at \{ display: none; \}/);
    expect(css.indexOf('home-hero-720.webp')).toBeGreaterThan(phoneAt);
    expect(css.slice(phoneAt)).toMatch(/body\.zen-lobby\.is-home \.pnav \{/);
  });
});
