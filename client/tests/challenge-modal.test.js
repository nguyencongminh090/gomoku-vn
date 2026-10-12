/**
 * #222 — ChallengeModal: friend picker (online first, search, offline allowed) → create-room-parity
 * settings + games + Swap Elo stake → POST /api/challenges.
 *
 * @jest-environment jsdom
 */

'use strict';

const flush = () => new Promise((r) => setTimeout(r, 0));
const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const F = (u, online) => ({ username: u, displayName: u.toUpperCase(), avatarUrl: null, online });

let M;
beforeEach(() => {
  jest.resetModules();
  document.body.innerHTML = '<button id="opener">x</button>';
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  window.PlatformShell = { avatar: () => document.createElement('span') };
  require('../js/challenge-modal.js');
  M = window.ChallengeModal;
});

const modal = () => document.querySelector('.pchal');
const friendRows = () => [...document.querySelectorAll('.pchal__friend')].map((b) => b.querySelector('.prow__t').textContent);
const radios = (labelKey) => {
  const row = [...document.querySelectorAll('.pchal__row')].find((r) => r.querySelector('.pchal__label').textContent === labelKey);
  return [...row.querySelectorAll('input')];
};
const pick = (labelKey, value) => {
  const i = radios(labelKey).find((x) => x.value === String(value));
  i.checked = true;
  i.dispatchEvent(new Event('change'));
};
const submit = async () => {
  document.querySelector('.pchal form').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush(); await flush();
};

describe('util', () => {
  test('sortFilter: online first, then name; filters by display name or username', () => {
    const list = [F('dan', false), F('bob', true), F('amy', false), F('cat', true)];
    expect(M.util.sortFilter(list, '').map((f) => f.username)).toEqual(['bob', 'cat', 'amy', 'dan']);
    expect(M.util.sortFilter(list, ' A ').map((f) => f.username)).toEqual(['cat', 'amy', 'dan']);
    expect(M.util.sortFilter(list, 'zzz')).toEqual([]);
  });

  test('normalize: Swap2 clears wall/portal; increment only in blitz', () => {
    expect(M.util.normalize({ ruleSwap2: true, ruleWall: true, rulePortal: true, timerMode: 'blitz', timerIncrementSeconds: 2 }))
      .toMatchObject({ ruleWall: false, rulePortal: false, timerIncrementSeconds: 2 });
    expect(M.util.normalize({ timerMode: 'per_move', timerIncrementSeconds: 5 }).timerIncrementSeconds).toBe(0);
  });

  test('describe: legacy row and full row', () => {
    expect(M.util.describe({ rule: 'caro', time: '3+2', rated: true })).toBe('rankings.cat_caro · 3+2 · challenge.rated');
    const s = { boardSize: 15, winningRule: 'freestyle', ranked: false, ruleWall: true, rulePortal: false, ruleSwap2: false, timerMode: 'per_move', timerSeconds: 45, timerIncrementSeconds: 0 };
    expect(M.util.describe({ settings: s, games: 1, stake: 'none' }))
      .toBe('rankings.cat_freestyle · 15×15 · modal.rule_wall · challenge.clock_move{"s":45} · room.mode_friendly');
  });
});

describe('friend picker', () => {
  test('lists all friends, online first, offline marked; search filters; picking opens that friend\'s settings', async () => {
    global.fetch = jest.fn(() => json({ friends: [F('dan', false), F('bob', true)], incoming: [], outgoing: [] }));
    M.open();
    await flush();
    expect(document.getElementById('pchal-title').textContent).toBe('challenge.pick_title');
    expect(friendRows()).toEqual(['BOB', 'DAN']);
    expect(document.querySelectorAll('.pchal__friend .pdot--on')).toHaveLength(1);
    expect(document.querySelectorAll('.pchal__friend')[1].textContent).toContain('challenge.offline');
    const search = document.querySelector('.pchal__search');
    search.value = 'da'; search.dispatchEvent(new Event('input'));
    expect(friendRows()).toEqual(['DAN']);
    search.value = 'qq'; search.dispatchEvent(new Event('input'));
    expect(document.querySelector('.pchal .pnote').textContent).toBe('challenge.no_match');
    search.value = ''; search.dispatchEvent(new Event('input'));
    document.querySelectorAll('.pchal__friend')[1].click(); // offline friend is allowed
    expect(document.getElementById('pchal-title').textContent).toBe('challenge.modal_title{"name":"DAN"}');
    // Back returns to the picker.
    [...document.querySelectorAll('.pchal button')].find((b) => b.textContent === 'challenge.back').click();
    await flush();
    expect(document.getElementById('pchal-title').textContent).toBe('challenge.pick_title');
  });

  test('no friends → note; fetch failure → error note', async () => {
    global.fetch = jest.fn(() => json({ friends: [] }));
    M.open();
    await flush();
    expect(document.querySelector('.pchal .pnote').textContent).toBe('social.none_friends');
    modal().remove();
    global.fetch = jest.fn(() => json({}, 500));
    M.open();
    await flush();
    expect(document.querySelector('.pchal .pnote').textContent).toBe('friends.error');
  });
});

describe('settings', () => {
  const to = { username: 'bob', displayName: 'Bob', avatarUrl: null };

  test('has every create-room control + games + stake', () => {
    M.open({ to });
    expect(radios('modal.mode').map((i) => i.value)).toEqual(['rated', 'friendly']);
    expect(radios('modal.board_size').map((i) => i.value)).toEqual(['15', '17', '19', '20']);
    expect(radios('modal.win_rule').map((i) => i.value)).toEqual(['freestyle', 'standard', 'caro']);
    expect(radios('modal.opening').map((i) => i.value)).toEqual(['none', 'swap2']);
    expect(radios('modal.special_rules')).toHaveLength(2);
    expect(radios('modal.timer_mode').map((i) => i.value)).toEqual(['per_move', 'per_game', 'blitz']);
    expect(document.querySelectorAll('.pchal__num input')).toHaveLength(3); // seconds, increment, custom games
    expect(radios('challenge.games').map((i) => i.value)).toEqual(['1', '3', '5', 'custom']);
    expect(radios('challenge.stake').map((i) => i.value)).toEqual(['none', 'swap']);
  });

  test('dependencies: Swap2 disables wall/portal; increment only in blitz; stake only when rated; hint only for swap', () => {
    M.open({ to });
    const [wall, portal] = radios('modal.special_rules');
    const [, inc] = document.querySelectorAll('.pchal__num input');
    wall.checked = true;
    pick('modal.opening', 'swap2');
    expect(wall.disabled && portal.disabled).toBe(true);
    expect(wall.checked).toBe(false);
    pick('modal.opening', 'none');
    expect(wall.disabled).toBe(false);
    expect(inc.disabled).toBe(true);
    pick('modal.timer_mode', 'blitz');
    expect(inc.disabled).toBe(false);
    const hint = document.querySelector('.pchal__hint');
    expect(hint.hidden).toBe(true);
    pick('challenge.stake', 'swap');
    expect(hint.hidden).toBe(false);
    pick('modal.mode', 'friendly');
    const [, swap] = radios('challenge.stake');
    expect(swap.disabled).toBe(true);
    expect(radios('challenge.stake')[0].checked).toBe(true);
    expect(hint.hidden).toBe(true);
  });

  test('submit posts the chosen settings, games and stake; closes and calls onSent', async () => {
    global.fetch = jest.fn(() => json({ id: 'c1' }, 201));
    const onSent = jest.fn();
    M.open({ to, onSent });
    pick('modal.board_size', 19);
    pick('modal.win_rule', 'caro');
    pick('modal.timer_mode', 'blitz');
    const [secs, inc] = document.querySelectorAll('.pchal__num input');
    secs.value = '300'; inc.value = '3';
    radios('modal.special_rules')[1].checked = true;
    pick('challenge.games', 3);
    pick('challenge.stake', 'swap');
    await submit();
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/challenges');
    expect(JSON.parse(opts.body)).toEqual({
      to: 'bob', games: 3, stake: 'swap',
      settings: { boardSize: 19, winningRule: 'caro', ranked: true, ruleSwap2: false, ruleWall: false, rulePortal: true, timerMode: 'blitz', timerSeconds: 300, timerIncrementSeconds: 3 },
    });
    expect(modal()).toBeNull();
    expect(onSent).toHaveBeenCalledWith({ id: 'c1' });
  });

  test('custom games: number input shows only for "custom" and is what gets posted', async () => {
    global.fetch = jest.fn(() => json({ id: 'c2' }, 201));
    M.open({ to });
    const custom = document.querySelectorAll('.pchal__num input')[2];
    expect(custom.closest('.pchal__num').hidden).toBe(true);
    pick('challenge.games', 'custom');
    expect(custom.closest('.pchal__num').hidden).toBe(false);
    custom.value = '7';
    await submit();
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).games).toBe(7);
  });

  test('Escape and backdrop click close; focus returns to the opener', () => {
    const opener = document.getElementById('opener');
    opener.focus();
    M.open({ to });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal()).toBeNull();
    expect(document.activeElement).toBe(opener);
    M.open({ to });
    modal().dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modal()).toBeNull();
  });

  test('dialog semantics: role=dialog, aria-modal, labelled by the title', () => {
    M.open({ to });
    const dlg = document.querySelector('.pchal__dlg');
    expect(dlg.getAttribute('role')).toBe('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dlg.getAttribute('aria-labelledby'))).not.toBeNull();
  });
});
