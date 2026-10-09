/**
 * B173 — colour mode (dark | light) on the "arena" skin.
 *
 * skin-preload.js sets data-skin/data-mode before first paint (cookie first,
 * localStorage fallback, default dark); ui-mode.js's setColorMode() flips it
 * and persists to both; the Settings panel exposes it as a segment. This is
 * the successor of the Dark UI removed in #160 — it is a new, token-based
 * mode (css/tokens.css), not the old [data-theme] blocks.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const n = c.split('=')[0].trim();
    if (n) document.cookie = n + '=; Path=/; Max-Age=0';
  });
}

function runPreload() {
  document.documentElement.removeAttribute('data-mode');
  document.documentElement.removeAttribute('data-skin');
  window.eval(read('skin-preload.js'));
}

beforeEach(() => {
  localStorage.clear();
  clearCookies();
});

describe('skin-preload.js', () => {
  test('defaults to arena + dark when nothing is stored', () => {
    runPreload();
    expect(document.documentElement.getAttribute('data-skin')).toBe('arena');
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
  });

  test('cookie wins over localStorage', () => {
    document.cookie = 'gvn_mode=light; Path=/';
    localStorage.setItem('gvn_color_mode', 'dark');
    runPreload();
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
  });

  test('falls back to localStorage when there is no cookie', () => {
    localStorage.setItem('gvn_color_mode', 'light');
    runPreload();
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
  });

  test.each(['', 'sepia', 'LIGHT'])('invalid stored value %p → dark', (v) => {
    localStorage.setItem('gvn_color_mode', v);
    runPreload();
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
  });
});

describe('setColorMode()', () => {
  beforeEach(() => {
    runPreload();
    window.eval(read('ui-mode.js'));
  });

  test('getColorMode reflects the attribute', () => {
    expect(window.getColorMode()).toBe('dark');
  });

  test('switching to light sets attribute, cookie, localStorage and fires colormodechange once', () => {
    const seen = [];
    window.addEventListener('colormodechange', (e) => seen.push(e.detail.mode));
    window.setColorMode('light');
    expect(document.documentElement.getAttribute('data-mode')).toBe('light');
    expect(document.cookie).toContain('gvn_mode=light');
    expect(localStorage.getItem('gvn_color_mode')).toBe('light');
    expect(seen).toEqual(['light']);
  });

  test('same mode and invalid values are no-ops (no event, nothing written)', () => {
    const seen = [];
    window.addEventListener('colormodechange', (e) => seen.push(e.detail.mode));
    window.setColorMode('dark');
    window.setColorMode('sepia');
    window.setColorMode(undefined);
    expect(seen).toEqual([]);
    expect(localStorage.getItem('gvn_color_mode')).toBeNull();
    expect(document.documentElement.getAttribute('data-mode')).toBe('dark');
  });
});

describe('Settings panel colour-mode row', () => {
  function loadPanel() {
    jest.resetModules();
    window.t = (k) => k;
    window.GvnSession = { getUser: () => ({ displayName: 'Tester', isGuest: false }) };
    window.getUiMode = () => 'lite';
    window.setUiMode = jest.fn();
    window.getLanguage = () => 'vi';
    window.setLanguage = jest.fn();
    window.getColorMode = () => 'dark';
    window.setColorMode = jest.fn();
    document.body.innerHTML = '<nav class="topnav"><div class="topnav__right"></div></nav>';
    require('../js/settings-panel.js');
    document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
    window.openSettingsPanel();
  }

  test('renders Dark/Light segment and wires it to setColorMode', () => {
    loadPanel();
    const opts = [...document.querySelectorAll('.gset-segment__opt')];
    const light = opts.find((b) => b.textContent === 'gset.mode_light');
    expect(opts.map((b) => b.textContent)).toEqual(expect.arrayContaining(['gset.mode_dark', 'gset.mode_light']));
    light.click();
    expect(window.setColorMode).toHaveBeenCalledWith('light');
  });
});
