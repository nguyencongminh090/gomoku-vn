/**
 * TODO.md #189 — platform shell (Arena nav + tab bar) and the `hidden` guard.
 * B193 — same shell site-wide: mockup nav items, rating on the user chip, Tôi tab, setActive().
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'platform.css'), 'utf8');

function boot(user, me = { username: 'zed' }, active = 'clubs') {
  jest.resetModules();
  document.body.innerHTML = '<div id="pl-shell"></div>';
  document.body.className = '';
  window.t = (k) => k;
  window.GvnSession = { getUser: () => user };
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(me) }));
  require('../js/platform-shell.js');
  window.PlatformShell.build(active);
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const MEMBER = { userId: 'u', isGuest: false, displayName: 'Zed' };

describe('platform shell', () => {
  it('builds nav + tab bar with the active page marked in both', () => {
    boot(null);
    const active = [...document.querySelectorAll('.is-active')].map((a) => a.getAttribute('href'));
    expect(active).toEqual(['/clubs.html', '/clubs.html']);
    expect([...document.querySelectorAll('.pnav__links a')].map((a) => a.dataset.tab))
      .toEqual(['lobby', 'tournaments', 'rankings', 'clubs', 'learn']);
    expect([...document.querySelectorAll('.ptabbar a')].map((a) => a.dataset.tab))
      .toEqual(['lobby', 'rankings', 'tournaments', 'clubs', 'me']);
    expect(document.querySelector('.pnav__links a[data-tab="tournaments"]').getAttribute('href')).toBe('/index.html#tournaments');
    expect(document.body.classList.contains('pshell')).toBe(true);
  });

  it('signed-out → Tôi tab goes to login', () => {
    boot(null);
    expect(document.querySelector('.ptabbar a[data-tab="me"]').getAttribute('href')).toBe('/login.html');
  });

  it('member → Tôi tab and chip point at /u/<username>; chip shows the most-played rating', async () => {
    boot(MEMBER, { username: 'zed', ratings: {
      freestyle: { rating: 1700.4, games: 3 }, caro: { rating: 1612.2, games: 80 }, standard: { rating: 1500, games: 20 } } });
    expect(document.querySelector('.ptabbar a[data-tab="me"]').getAttribute('href')).toBe('#');
    await flush();
    expect(document.querySelector('.ptabbar a[data-tab="me"]').getAttribute('href')).toBe('/u/zed');
    expect(document.querySelector('.pnav__me small').textContent).toBe('rankings.cat_caro 1612');
  });

  it('member with no rated games → empty rating line; /me failure → chip stays inert', async () => {
    boot(MEMBER, { username: 'zed', ratings: {} });
    await flush();
    expect(document.querySelector('.pnav__me small').textContent).toBe('');
    boot(MEMBER);
    global.fetch = jest.fn(() => Promise.reject(new Error('net')));
    window.PlatformShell.build('clubs');
    await flush();
    expect(document.querySelector('.pnav__me').getAttribute('href')).toBe('#');
  });

  it('setActive() moves the marker in nav and tab bar without rebuilding', () => {
    boot(null, undefined, 'lobby');
    const nav = document.querySelector('.pnav');
    window.PlatformShell.setActive('tournaments');
    expect(document.querySelector('.pnav')).toBe(nav);
    const on = [...document.querySelectorAll('.is-active')].map((a) => a.dataset.tab);
    expect(on).toEqual(['tournaments', 'tournaments']);
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(2);
    window.PlatformShell.setActive('learn'); // nav-only item: tab bar shows none
    expect([...document.querySelectorAll('.is-active')].map((a) => a.dataset.tab)).toEqual(['learn']);
  });

  it('signed-out → login link, no network call', () => {
    boot(null);
    expect(document.querySelector('.pnav__login').getAttribute('href')).toBe('/login.html');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('guest session is treated as signed-out', () => {
    boot({ userId: 'g', isGuest: true, displayName: 'Guest' });
    expect(document.querySelector('.pnav__login')).not.toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('member → user chip that links to /u/<username> once known; display name as text', async () => {
    boot({ userId: 'u', isGuest: false, displayName: '<i>Zed</i>' });
    await new Promise((r) => setTimeout(r, 0));
    const me = document.querySelector('.pnav__me');
    expect(me.getAttribute('href')).toBe('/u/zed');
    expect(me.textContent).toContain('<i>Zed</i>');
    expect(me.querySelector('i')).toBeNull();
  });

  it('mode button flips colour mode through ui-mode.js', () => {
    boot(null);
    window.getColorMode = () => 'dark';
    window.setColorMode = jest.fn();
    document.querySelector('.pnav__mode').click();
    expect(window.setColorMode).toHaveBeenCalledWith('light');
  });

  it('adds a Settings gear only when the settings panel is loaded; it opens it', () => {
    boot(null);
    expect(document.querySelectorAll('.pnav__mode')).toHaveLength(1);
    window.openSettingsPanel = jest.fn();
    window.PlatformShell.build('clubs');
    const buttons = document.querySelectorAll('.pnav__mode');
    expect(buttons).toHaveLength(2);
    buttons[1].click();
    expect(window.openSettingsPanel).toHaveBeenCalled();
    delete window.openSettingsPanel;
  });

  it('avatar(): image when present, initials otherwise', () => {
    boot(null);
    expect(window.PlatformShell.avatar(null, 'minh', 'pav--xl').textContent).toBe('MI');
    expect(window.PlatformShell.avatar('/a.webp?v=1', 'minh').style.backgroundImage).toContain('/a.webp?v=1');
  });
});

describe('platform.css', () => {
  it('makes [hidden] win over any class display (club Join/Leave/Delete bug)', () => {
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  });
  it('is tokens-only: no hard-coded hex colours', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
