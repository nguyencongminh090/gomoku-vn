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
// ES module → classic script: swap the lobby.js import for a stub, expose the exports.
const HOME = read('js/lobby-home.js')
  .replace(/^import [^\n]*lobby\.js[^\n]*\n/m, 'const { client, setHeroTab } = window.__lobbyStub;\n')
  .replace(/^export (function|async function) (\w+)/gm, (m, kw, name) => `window.__home = window.__home || {}; window.__home.${name} = ${name};\n${kw} ${name}`);

const EMPTY = { myGame: null, myMatches: [], tournaments: [], live: [] };
const flush = () => new Promise((r) => setTimeout(r, 0));

async function boot(url = '/index.html', data = EMPTY, user = null, opts = {}) {
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
  global.fetch = jest.fn((u) => Promise.resolve(String(u).startsWith('/api/home')
    ? { ok: true, json: () => Promise.resolve(data) }
    : { ok: false, json: () => Promise.resolve({}) }));
  window.eval(SHELL);
  window.PlatformShell.build('lobby');
  window.eval(HOME);
  await flush();
}

const visible = () => ['screen-home', 'panel-tables', 'panel-tournaments'].filter((id) => {
  const n = document.getElementById(id);
  return n.classList.contains('is-active') && !n.hidden;
});
const actions = () => ['btn-create', 'btn-create-tournament'].filter((id) => !document.getElementById(id).hidden);
const navOn = () => [...document.querySelectorAll('#pl-shell .is-active')].map((a) => a.dataset.tab);

afterEach(() => { window.__home.showScreen && window.__home.showScreen('rooms'); }); // stop polling

describe('screens ↔ hash ↔ shell nav', () => {
  it.each([
    ['/index.html', 'screen-home', [], ['lobby', 'lobby'], 'home'],
    ['/index.html#rooms', 'panel-tables', ['btn-create'], ['rooms'], 'tables'],
    ['/index.html#tournaments', 'panel-tournaments', ['btn-create-tournament'], ['tournaments', 'tournaments'], 'tournaments'],
    ['/index.html#bogus', 'screen-home', [], ['lobby', 'lobby'], 'home'],
  ])('%s → %s', async (url, screen, acts, nav, hero) => {
    await boot(url);
    expect(visible()).toEqual([screen]);
    expect(actions()).toEqual(acts);
    expect(document.getElementById('lobby-bar').hidden).toBe(acts.length === 0);
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
    live: [{ roomId: 'L1', black: 'kim', white: 'sak', viewers: 120, boardSize: 15, stones: [[7, 7, 1], [8, 8, 2], [99, 0, 1]],
      winningRule: 'freestyle', timerMode: 'per_move', timerSeconds: 30 }],
  };

  it('my game row: opponent as text, rule line, your-turn meta; click joins the room', async () => {
    await boot('/index.html', DATA);
    const rows = document.querySelectorAll('#home-mine .prow');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('img')).toBeNull();
    expect(rows[0].querySelector('.prow__t').textContent)
      .toBe('home.vs{"name":"<img src=x onerror=alert(1)>"} · rankings.cat_caro · 5+3');
    expect(rows[0].querySelector('.prow__m').textContent).toBe('home.your_turn');
    rows[0].click();
    expect(window.joinRoom).toHaveBeenCalledWith('R1');
  });

  it('tournament match row: round is 1-based, state label, links to the tournament', async () => {
    await boot('/index.html', DATA);
    const row = document.querySelectorAll('#home-mine .prow')[1];
    expect(row.querySelector('.prow__t').textContent).toBe('Sat · home.round{"n":3}');
    expect(row.querySelector('.prow__m').textContent).toBe('home.vs{"name":"Bob"} · home.match_Ready');
    expect(row.querySelector('.hbullet.on')).not.toBeNull();
  });

  it('today: registered vs register vs view labels', async () => {
    await boot('/index.html', DATA);
    const acts = [...document.querySelectorAll('#home-today .prow__act')].map((n) => n.textContent);
    expect(acts).toEqual(['home.registered', 'home.register']);
  });

  it('live: mini board draws in-bounds stones only + last-move dot; click spectates', async () => {
    await boot('/index.html', DATA);
    const card = document.querySelector('#home-live .hlive');
    expect(card.querySelectorAll('circle.sb')).toHaveLength(1);
    expect(card.querySelectorAll('circle.sw')).toHaveLength(1);
    expect(card.querySelectorAll('line')).toHaveLength(30);
    expect(card.textContent).toContain('home.viewers{"n":120}');
    expect(card.textContent).toContain('home.per_move{"s":30}');
    card.click();
    expect(window.joinRoom).toHaveBeenCalledWith('L1');
  });

  it('live card with no spectators omits the viewer count', async () => {
    await boot('/index.html', { ...EMPTY, live: [{ ...DATA.live[0], viewers: 0 }] });
    expect(document.querySelector('#home-live .hlive').textContent).not.toContain('home.viewers');
  });

  it('empty payload → empty states; "find a room" goes to the rooms screen', async () => {
    await boot('/index.html', EMPTY);
    expect(document.querySelector('#home-today').textContent).toBe('home.no_today');
    expect(document.querySelector('#home-live').textContent).toBe('home.no_live');
    document.querySelector('#home-mine .link-action').click();
    expect(visible()).toEqual(['panel-tables']);
  });

  it('fetch failure on first load still renders empty states, no throw', async () => {
    jest.useRealTimers();
    await boot('/index.html#rooms');
    global.fetch = jest.fn(() => Promise.reject(new Error('net')));
    window.__home.showScreen('home');
    await flush();
    expect(document.querySelector('#home-live').textContent).toBe('home.no_live');
  });

  it('waiting room (no opponent) shows the room name and "waiting"', async () => {
    await boot('/index.html', { ...EMPTY, myGame: { roomId: 'R', roomName: 'My room', state: 'idle', opponent: null, myTurn: false } });
    const row = document.querySelector('#home-mine .prow');
    expect(row.querySelector('.prow__t').textContent).toBe('My room');
    expect(row.querySelector('.prow__m').textContent).toBe('home.waiting');
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

describe('quick match panel (B197)', () => {
  const MEMBER = { userId: 'u1', isGuest: false, displayName: 'Me' };
  const GUEST = { userId: 'g1', isGuest: true, displayName: 'G' };
  const client = () => window.__lobbyStub.client;
  const chips = (id) => [...document.querySelectorAll('#' + id + ' .pchip')];
  const pressed = (id) => chips(id).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
  const buttons = () => [...document.querySelectorAll('#qm-actions button')].map((b) => b.textContent);

  it('member: 3 rule chips, 4 time chips, Caro VN · 5+3 by default, rated + casual buttons', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    expect(chips('qm-rule').map((b) => b.textContent)).toEqual(['rankings.cat_freestyle', 'rankings.cat_standard', 'rankings.cat_caro']);
    expect(chips('qm-time').map((b) => b.textContent)).toEqual(['1+0', '3+2', '5+3', '10+0']);
    expect([pressed('qm-rule'), pressed('qm-time')]).toEqual([['rankings.cat_caro'], ['5+3']]);
    expect(buttons()).toEqual(['qm.find_rated', 'qm.find_casual']);
  });

  it('guest: casual only, with the reason in the status line', async () => {
    await boot('/index.html', EMPTY, GUEST);
    expect(buttons()).toEqual(['qm.find_casual']);
    expect(document.getElementById('qm-line').textContent).toContain('qm.guest_casual_only');
  });

  it('picking chips changes the request and is remembered; a saved choice is restored', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    chips('qm-rule')[0].click();
    chips('qm-time')[0].click();
    document.querySelectorAll('#qm-actions button')[0].click();
    expect(client().emitted.pop()).toEqual(['match:join', { rule: 'freestyle', time: '1+0', rated: true }]);
    expect(JSON.parse(localStorage.getItem('gvn_quickmatch'))).toEqual({ rule: 'freestyle', time: '1+0' });
    await boot('/index.html', EMPTY, MEMBER, { saved: { rule: 'standard', time: '10+0' } });
    expect([pressed('qm-rule'), pressed('qm-time')]).toEqual([['rankings.cat_standard'], ['10+0']]);
  });

  it('a bogus saved choice falls back to the defaults', async () => {
    await boot('/index.html', EMPTY, MEMBER, { saved: { rule: 'renju', time: '2+1' } });
    expect([pressed('qm-rule'), pressed('qm-time')]).toEqual([['rankings.cat_caro'], ['5+3']]);
  });

  it('searching: chips lock, Cancel only, elapsed + queue count; cancel emits match:leave', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    client().fire('match:status', { waiting: true, inBucket: 3, rated: true });
    expect(chips('qm-rule').every((b) => b.disabled)).toBe(true);
    expect(buttons()).toEqual(['qm.cancel']);
    expect(document.getElementById('qm-line').textContent).toBe('qm.searching_rated{"t":"0:00"} · qm.in_queue{"n":3}');
    document.querySelector('#qm-actions button').click();
    expect(client().emitted.pop()).toEqual(['match:leave', undefined]);
    client().fire('match:status', { waiting: false });
    expect(buttons()).toEqual(['qm.find_rated', 'qm.find_casual']);
    expect(chips('qm-rule').some((b) => b.disabled)).toBe(false);
  });

  it('alone in the bucket → no queue count', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    client().fire('match:status', { waiting: true, inBucket: 1, rated: false });
    expect(document.getElementById('qm-line').textContent).toBe('qm.searching_casual{"t":"0:00"}');
  });

  it('match:error shows the translated code and unlocks', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    client().fire('match:status', { waiting: true, inBucket: 1 });
    client().fire('match:error', { code: 'ALREADY_IN_ANOTHER_ROOM', message: 'x' });
    expect(document.getElementById('qm-line').textContent).toBe('err.already_in_another_room');
    expect(buttons()).toEqual(['qm.find_rated', 'qm.find_casual']);
  });

  it('match:found → "entering the room" (lobby.js follows room:joined)', async () => {
    await boot('/index.html', EMPTY, MEMBER);
    client().fire('match:status', { waiting: true, inBucket: 2 });
    client().fire('match:found', { roomId: 'R' });
    expect(document.getElementById('qm-line').textContent).toBe('qm.found');
  });
});

describe('Vào bằng mã (Phòng screen, B210)', () => {
  const $ = (id) => document.getElementById(id);
  const submit = (value) => {
    $('join-code').value = value;
    $('join-code-form').dispatchEvent(new Event('submit', { cancelable: true }));
  };

  it('button lives on the Phòng screen only; the form is closed until it is pressed', async () => {
    await boot('/index.html#rooms', EMPTY, null);
    expect($('btn-join-code').hidden).toBe(false);
    expect($('join-code-form').hidden).toBe(true);
    $('btn-join-code').click();
    expect($('join-code-form').hidden).toBe(false);
    expect($('btn-join-code').getAttribute('aria-expanded')).toBe('true');
    window.location.hash = '#tournaments';
    window.dispatchEvent(new Event('hashchange'));
    expect($('btn-join-code').hidden).toBe(true);
    expect($('join-code-form').hidden).toBe(true);
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
    $('join-code').dispatchEvent(new Event('input'));
    expect($('join-code-error').hidden).toBe(true);
    submit('a3f');
    expect(window.joinRoom).toHaveBeenCalledWith('#A3F');
  });

  it('home: "Thách đấu bạn bè" links to the social page for members, absent for guests', async () => {
    await boot('/index.html', EMPTY, { userId: 'u', isGuest: false, displayName: 'Z' });
    const link = [...$('qm-actions').querySelectorAll('a')].find((a) => a.textContent === 'qm.challenge_friend');
    expect(link.getAttribute('href')).toBe('/social.html');
    await boot('/index.html', EMPTY, { userId: 'g', isGuest: true, displayName: 'G' });
    expect($('qm-actions').querySelector('a')).toBeNull();
  });
});
