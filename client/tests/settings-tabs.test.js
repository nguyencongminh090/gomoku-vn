/**
 * B211 — /settings.html tabs (Hồ sơ | Giao diện | Trò chơi | Tài khoản): guests lose Hồ sơ only, controls drive
 * the same stores as the gear panel, icon-only segments stay labelled.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/settings.html"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BODY_HTML = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const $ = (id) => document.getElementById(id);
const MEMBER = { userId: 'u', isGuest: false, displayName: 'Zed' };
const GUEST = { userId: 'g', isGuest: true, displayName: 'Khách_1' };

// Each boot re-requires the script, which re-adds its DOMContentLoaded handler on the shared document — drop stale ones.
const added = [];
afterEach(() => { for (const [type, fn] of added.splice(0)) document.removeEventListener(type, fn); });

function boot(user, hash = '') {
  jest.resetModules();
  for (const [type, fn] of added.splice(0)) document.removeEventListener(type, fn);
  jest.restoreAllMocks();
  const orig = document.addEventListener.bind(document);
  jest.spyOn(document, 'addEventListener').mockImplementation((type, fn, o) => { added.push([type, fn]); orig(type, fn, o); });
  document.body.innerHTML = BODY_HTML;
  window.history.replaceState(null, '', '/settings.html' + hash);
  window.t = (k, v) => (v && v.name ? k + ':' + v.name : k);
  window.GvnSession = { getUser: () => user, logout: jest.fn(() => Promise.resolve(true)) };
  window.GvnSettings = {
    getClickMode: jest.fn(() => 'double'), setClickMode: jest.fn(),
    getDisplayMode: jest.fn(() => 'paper'), setDisplayMode: jest.fn(),
    isSoundOn: jest.fn(() => true), setSoundOn: jest.fn(),
  };
  Object.assign(window, {
    getSkin: () => 'arena', setSkin: jest.fn(), getColorMode: () => 'dark', setColorMode: jest.fn(),
    getUiMode: () => 'lite', setUiMode: jest.fn(), getLanguage: () => 'vi', setLanguage: jest.fn(),
  });
  require('../js/settings-page.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
}
const shown = () => ['profile', 'look', 'game', 'account'].filter((id) => !$('p-' + id).hidden);

describe('settings page tabs', () => {
  it('member: Hồ sơ first, the other three tabs follow; one panel visible at a time', () => {
    boot(MEMBER);
    expect(shown()).toEqual(['profile']);
    expect($('tab-profile').hidden).toBe(false);
    $('tab-game').click();
    expect(shown()).toEqual(['game']);
    expect($('tab-game').getAttribute('aria-selected')).toBe('true');
    expect($('tab-profile').getAttribute('aria-selected')).toBe('false');
  });

  it('guest: no Hồ sơ tab, starts on Giao diện, Tài khoản offers "create account"', () => {
    boot(GUEST);
    expect($('tab-profile').hidden).toBe(true);
    expect(shown()).toEqual(['look']);
    expect($('p-account').querySelector('a[href="/login.html"]')).not.toBeNull();
    expect($('p-account').textContent).not.toContain('gset.btn_logout');
  });

  it('#game in the URL opens that tab; #profile is ignored for guests', () => {
    boot(MEMBER, '#game');
    expect(shown()).toEqual(['game']);
    boot(GUEST, '#profile');
    expect(shown()).toEqual(['look']);
  });

  it('arrow keys move between visible tabs (guest skips the hidden Hồ sơ)', () => {
    boot(GUEST);
    $('st-tabs').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(shown()).toEqual(['account']); // wraps past the hidden first tab
  });

  it('Giao diện: segments call the stores; icon-only segments carry aria-label + title', () => {
    boot(GUEST);
    const modeBtns = [...$('p-look').querySelectorAll('.pseg')[1].querySelectorAll('button')];
    expect(modeBtns.map((b) => b.getAttribute('aria-label'))).toEqual(['gset.mode_light', 'gset.mode_dark']);
    expect(modeBtns.every((b) => b.title && b.querySelector('svg use'))).toBe(true);
    expect(modeBtns[1].getAttribute('aria-pressed')).toBe('true');
    modeBtns[0].click();
    expect(window.setColorMode).toHaveBeenCalledWith('light');
    [...$('p-look').querySelectorAll('.pseg')[0].querySelectorAll('button')][1].click();
    expect(window.setSkin).toHaveBeenCalledWith('zen');
    [...$('p-look').querySelectorAll('.pseg')[3].querySelectorAll('button')][1].click();
    expect(window.setLanguage).toHaveBeenCalledWith('en');
  });

  it('Trò chơi: placement, board display and sound go through GvnSettings', () => {
    boot(GUEST);
    const segs = $('p-game').querySelectorAll('.pseg');
    segs[0].querySelectorAll('button')[0].click();
    expect(window.GvnSettings.setClickMode).toHaveBeenCalledWith('single');
    segs[1].querySelectorAll('button')[1].click();
    expect(window.GvnSettings.setDisplayMode).toHaveBeenCalledWith('stone');
    const sound = $('p-game').querySelector('.pswitch input');
    sound.checked = false;
    sound.dispatchEvent(new Event('change'));
    expect(window.GvnSettings.setSoundOn).toHaveBeenCalledWith(false);
  });

  it('colour mode changed elsewhere (nav toggle) re-renders the pressed state', () => {
    boot(GUEST);
    window.getColorMode = () => 'light';
    window.dispatchEvent(new CustomEvent('colormodechange'));
    const pressed = [...$('p-look').querySelectorAll('.pseg')[1].querySelectorAll('[aria-pressed="true"]')].map((b) => b.getAttribute('aria-label'));
    expect(pressed).toEqual(['gset.mode_light']);
  });

  it('member Tài khoản: logout works; a failed logout keeps the user here and says so', async () => {
    boot(MEMBER);
    const out = $('p-account').querySelector('.pbtn--danger');
    window.GvnSession.logout.mockResolvedValueOnce(false);
    out.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(out.disabled).toBe(false);
    expect(out.textContent).toBe('gset.btn_logout_failed');
  });
});
