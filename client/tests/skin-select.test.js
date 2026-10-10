/**
 * TODO.md #180 — skin (arena | zen | bento): preload, setSkin() persistence +
 * member sync, applySavedSkin() on a fresh device, Settings segment.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const root = () => document.documentElement;

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const n = c.split('=')[0].trim();
    if (n) document.cookie = n + '=; Path=/; Max-Age=0';
  });
}

function boot({ member = false } = {}) {
  root().removeAttribute('data-skin');
  root().removeAttribute('data-mode');
  window.eval(read('skin-preload.js'));
  window.GvnSession = { getUser: () => (member ? { userId: 'u1', isGuest: false } : null) };
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ uiSkin: 'bento' }) }));
  window.fetch = global.fetch;
  window.eval(read('ui-mode.js'));
}

beforeEach(() => { localStorage.clear(); clearCookies(); });

describe('skin-preload.js', () => {
  test.each(['zen', 'bento'])('cookie %s is applied', (s) => {
    document.cookie = `gvn_skin=${s}; Path=/`;
    boot();
    expect(root().getAttribute('data-skin')).toBe(s);
  });

  test('localStorage fallback; unknown value → arena', () => {
    localStorage.setItem('gvn_skin', 'zen');
    boot();
    expect(root().getAttribute('data-skin')).toBe('zen');
    localStorage.setItem('gvn_skin', 'neon');
    boot();
    expect(root().getAttribute('data-skin')).toBe('arena');
  });

  test('skin and mode are independent axes', () => {
    document.cookie = 'gvn_skin=bento; Path=/';
    document.cookie = 'gvn_mode=light; Path=/';
    boot();
    expect([root().getAttribute('data-skin'), root().getAttribute('data-mode')]).toEqual(['bento', 'light']);
  });
});

describe('setSkin()', () => {
  test('applies, persists to cookie + localStorage, fires skinchange; guests do not hit the server', () => {
    boot();
    const seen = jest.fn();
    window.addEventListener('skinchange', seen);
    window.setSkin('zen');
    expect(root().getAttribute('data-skin')).toBe('zen');
    expect(document.cookie).toContain('gvn_skin=zen');
    expect(localStorage.getItem('gvn_skin')).toBe('zen');
    expect(seen).toHaveBeenCalledTimes(1);
    expect(window.fetch).not.toHaveBeenCalled();
  });

  test('ignores unknown skins and no-op repeats', () => {
    boot();
    const seen = jest.fn();
    window.addEventListener('skinchange', seen);
    window.setSkin('neon');
    window.setSkin('arena');
    expect(seen).not.toHaveBeenCalled();
    expect(root().getAttribute('data-skin')).toBe('arena');
  });

  test('a signed-in member also saves it to the profile', () => {
    boot({ member: true });
    window.setSkin('bento');
    expect(window.fetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ uiSkin: 'bento' }) }));
  });
});

describe('applySavedSkin()', () => {
  test('fresh device + member → adopts the saved skin without writing it back', async () => {
    boot({ member: true });
    await window.applySavedSkin();
    expect(root().getAttribute('data-skin')).toBe('bento');
    expect(window.fetch).toHaveBeenCalledTimes(1); // only GET /prefs, no PUT echo
    expect(window.fetch.mock.calls[0][0]).toBe('/api/profile/prefs');
  });

  test('a device that already chose a skin keeps it and does not fetch', async () => {
    localStorage.setItem('gvn_skin', 'zen');
    boot({ member: true });
    await window.applySavedSkin();
    expect(root().getAttribute('data-skin')).toBe('zen');
    expect(window.fetch).not.toHaveBeenCalled();
  });

  test('guests / logged-out never call the server', async () => {
    boot();
    await window.applySavedSkin();
    expect(window.fetch).not.toHaveBeenCalled();
  });
});

describe('Settings panel', () => {
  test('source wires a skin segment to getSkin/setSkin with all three skins', () => {
    const src = read('settings-panel.js');
    expect(src).toContain('global.setSkin(value)');
    for (const k of ['arena', 'zen', 'bento']) expect(src).toContain(`['${k}', T('gset.skin_${k}')]`);
  });
});
