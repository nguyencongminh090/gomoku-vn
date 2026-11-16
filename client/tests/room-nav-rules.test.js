/**
 * TODO.md #376 — room nav N1 "Thẻ bàn": the ticket [code | mode | rules], the rules popover, and the ≡ menu
 * (rules / QR / invite link / settings / site links); Rời phòng stays on the bar.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/room.html?id=%23ABC"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
const BODY_HTML = HTML.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
const I18N = { 'room.table_label': 'Bàn {code}', 'room.rule_wall': 'Ô khoá', 'room.rule_portal': 'Hố đen',
  'rule.freestyle': 'Luật 1', 'rule.standard': 'Tiêu chuẩn', 'rule.caro': 'Luật 2',
  'room.mode_friendly': 'Giao hữu', 'room.mode_rated': 'Xếp hạng' };

const $ = (id) => document.getElementById(id);

function render(settings = {}, { roomName } = {}) {
  document.body.innerHTML = BODY_HTML;
  window.t = jest.fn((key, vars) => {
    let s = I18N[key] || key;
    for (const [k, v] of Object.entries(vars || {})) s = s.replace(`{${k}}`, v);
    return s;
  });
  window.showToast = jest.fn();
  window.openSettingsPanel = jest.fn();
  jest.resetModules();
  window.EscapeUtils = require('../js/escape-utils.js');
  window.GameUI = { initBoard: jest.fn() };
  window.RoomState = {
    roomData: {
      roomId: '#ABC', roomName,
      state: 'waiting',
      settings: { winningRule: 'freestyle', timerMode: 'none', timerSeconds: 60, ranked: false, ...settings },
      scoreTable: {},
      users: [{ userId: 'me', displayName: 'Me', slot: null, role: 'guest', ready: false, presence: 'active' }],
    },
    gameState: null,
    timerValues: { black: 60, white: 60 },
    myUser: { userId: 'me', displayName: 'Me' },
  };
  require('../js/room-ui.js');
  window.RoomUI.updateUI();
}

const rulesLine = () => [...$('room-rules-text').querySelectorAll('.rnav__rules-full > span')].map((s) => s.textContent);
const rulesShort = () => $('room-rules-text').querySelector('.rnav__rules-short').textContent;
const popRules = () => [...$('rules-pop-body').querySelectorAll('.rules-pop__rule')].map((s) => s.dataset.rule);

describe('rules line in the nav', () => {
  test.each([
    [{ winningRule: 'freestyle' }, ['Luật 1']],
    [{ winningRule: 'standard' }, ['Tiêu chuẩn']],
    [{ winningRule: 'caro', ruleWall: true }, ['Luật 2', 'Ô khoá']],
    [{ winningRule: 'caro', ruleWall: true, rulePortal: true, ruleSwap2: true }, ['Luật 2', 'Ô khoá', 'Hố đen', 'Swap2']],
    [{ winningRule: undefined }, ['Luật 1']],
    [{ winningRule: 'bogus' }, ['Luật 1']],
  ])('%j → %j', (settings, expected) => {
    render(settings);
    expect(rulesLine()).toEqual(expected);
    expect(rulesShort()).toBe(expected[0] + (expected.length > 1 ? ' +' + (expected.length - 1) : ''));
    expect($('room-menu-rules').textContent).toBe(expected.join(' · '));
  });

  test('the mode sits on the same button as the rules', () => {
    render({ winningRule: 'caro' });
    const btn = $('btn-room-rules');
    expect(btn.contains($('room-mode-badge'))).toBe(true);
    expect($('room-mode-badge').textContent).toContain('Giao hữu');
    expect($('room-mode-badge').title).toBe('Giao hữu');
  });
});

describe('rules popover', () => {
  test('opens with one block per active rule, the win rule first with its example', () => {
    render({ winningRule: 'caro', ruleWall: true });
    expect($('rules-pop').hidden).toBe(true);
    $('btn-room-rules').click();
    expect($('rules-pop').hidden).toBe(false);
    expect($('btn-room-rules').getAttribute('aria-expanded')).toBe('true');
    expect(popRules()).toEqual(['caro', 'wall']);
    const caro = $('rules-pop-body').querySelector('[data-rule="caro"]');
    expect(caro.textContent).toContain('rules.caro_desc');
    expect(caro.querySelectorAll('.rex__c--o')).toHaveLength(2); // blocked on both ends
    expect(caro.querySelector('.rex__verdict--no')).not.toBeNull();
    expect($('rules-pop-body').querySelector('[data-rule="wall"] .rex')).toBeNull();
  });

  test.each([
    ['freestyle', 'ok', 6],
    ['standard', 'no', 6],
  ])('%s example: six in a row → %s', (rule, verdict, n) => {
    render({ winningRule: rule });
    $('btn-room-rules').click();
    const block = $('rules-pop-body').querySelector(`[data-rule="${rule}"]`);
    expect(block.querySelectorAll('.rex__c--x')).toHaveLength(n);
    expect(block.querySelector(`.rex__verdict--${verdict}`)).not.toBeNull();
  });

  test('closes on a second click, Escape (focus back on the opener) and an outside click', () => {
    render();
    const btn = $('btn-room-rules');
    btn.click(); btn.click();
    expect($('rules-pop').hidden).toBe(true);
    btn.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect($('rules-pop').hidden).toBe(true);
    expect(document.activeElement).toBe(btn);
    btn.click();
    document.body.click();
    expect($('rules-pop').hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  test('a click inside the popover keeps it open', () => {
    render();
    $('btn-room-rules').click();
    $('rules-pop-body').click();
    expect($('rules-pop').hidden).toBe(false);
  });
});

describe('≡ menu', () => {
  test('toggles, and only one of menu / rules is open at a time', () => {
    render();
    $('btn-room-menu').click();
    expect($('room-menu').hidden).toBe(false);
    expect($('btn-room-menu').getAttribute('aria-expanded')).toBe('true');
    $('btn-room-rules').click();
    expect($('room-menu').hidden).toBe(true);
    expect($('rules-pop').hidden).toBe(false);
    $('btn-room-menu').click();
    expect($('rules-pop').hidden).toBe(true);
    $('btn-room-menu').click();
    expect($('room-menu').hidden).toBe(true);
  });

  test('holds QR, invite link, settings and the six site links', () => {
    render();
    const menu = $('room-menu');
    for (const id of ['btn-room-qr', 'btn-room-invite', 'btn-room-settings', 'room-site-links']) expect(menu.contains($(id))).toBe(true);
    expect($('room-site-links').querySelectorAll('a')).toHaveLength(6);
  });

  test('"Luật của ván này" in the menu swaps the menu for the rules popover', () => {
    render({ winningRule: 'standard' });
    $('btn-room-menu').click();
    $('btn-menu-rules').click();
    expect($('room-menu').hidden).toBe(true);
    expect($('rules-pop').hidden).toBe(false);
    expect(popRules()).toEqual(['standard']);
  });

  test('Rời phòng stays on the bar, not in the menu (the exit must never hide — user 2026-11-14)', () => {
    render();
    const leave = $('btn-leave');
    expect(leave.closest('.rnav')).not.toBeNull();
    expect($('room-menu').contains(leave)).toBe(false);
    expect(leave.getAttribute('aria-label')).toBeTruthy(); // icon-only on phones
  });

  test('Cài đặt opens the global settings panel and closes the menu', () => {
    render();
    $('btn-room-menu').click();
    $('btn-room-settings').click();
    expect(window.openSettingsPanel).toHaveBeenCalled();
    expect($('room-menu').hidden).toBe(true);
  });

  test('invite copies the join link', async () => {
    render();
    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    $('btn-room-invite').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(writeText).toHaveBeenCalledWith('http://localhost/room.html?id=%23ABC');
    expect(window.showToast).toHaveBeenCalledWith('room.invite_copied', 'success', 1800);
  });

  test('no settings gear is mounted into the room nav (no .topnav__right)', () => {
    render();
    expect(document.querySelector('.topnav__right')).toBeNull();
  });
});

describe('code segment + menu title', () => {
  test('the ticket shows the short code even for a named table; the name is in the title', () => {
    render({}, { roomName: 'Phòng của Mai' });
    expect($('room-id-nav').textContent.trim()).toBe('#ABC');
    expect($('room-id-nav').title).toContain('Phòng của Mai');
  });

  test('the menu is headed "Bàn <code> · <mode>"', () => {
    render();
    expect($('room-menu-title').textContent).toBe('Bàn #ABC · Giao hữu');
  });
});
