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
const menuItems = () => [...document.querySelectorAll('.pnav__menu a')].map((a) => [a.getAttribute('href'), a.textContent]).filter((i) => !/admin/.test(i[0]));
const flush = () => new Promise((r) => setTimeout(r, 0));
const MEMBER = { userId: 'u', isGuest: false, displayName: 'Zed' };

describe('platform shell', () => {
  it('builds nav + tab bar with the active page marked in both', () => {
    boot(null);
    const active = [...document.querySelectorAll('.is-active')].map((a) => a.getAttribute('href'));
    expect(active).toEqual(['/clubs.html', '/clubs.html']);
    expect([...document.querySelectorAll('.pnav__links a')].map((a) => a.dataset.tab))
      .toEqual(['lobby', 'rooms', 'tournaments', 'rankings', 'clubs', 'learn']);
    expect([...document.querySelectorAll('.ptabbar a')].map((a) => a.dataset.tab))
      .toEqual(['lobby', 'rankings', 'tournaments', 'clubs', 'me']);
    expect(document.querySelector('.pnav__links a[data-tab="tournaments"]').getAttribute('href')).toBe('/index.html#tournaments');
    expect(document.body.classList.contains('pshell')).toBe(true);
  });

  it('mobile tab bar: Xếp hạng uses the crown (mockup), not the podium', () => {
    boot(null);
    const use = document.querySelector('.ptabbar a[data-tab="rankings"] use').getAttribute('href');
    expect(use).toMatch(/^\/assets\/icons\/phosphor-sprite\.svg\?v=[0-9a-f]+#ph-regular-crown-simple$/);
  });

  it('signed-out → Tôi tab goes to login', () => {
    boot(null);
    expect(document.querySelector('.ptabbar a[data-tab="me"]').getAttribute('href')).toBe('/login.html');
  });

  it('member → Tôi tab and chip point at /u/<username>; menu header shows the most-played rating, chip stays name-only', async () => {
    boot(MEMBER, { username: 'zed', ratings: {
      freestyle: { rating: 1700.4, games: 3 }, caro: { rating: 1612.2, games: 80 }, standard: { rating: 1500, games: 20 } } });
    expect(document.querySelector('.ptabbar a[data-tab="me"]').getAttribute('href')).toBe('#');
    await flush();
    expect(document.querySelector('.ptabbar a[data-tab="me"]').getAttribute('href')).toBe('/u/zed');
    expect(document.querySelector('.pnav__menu .pnav__who small').textContent).toBe('rankings.cat_caro 1612');
    expect(document.querySelector('.pnav__me small')).toBeNull();
  });

  it('member with no rated games → "unrated" under the menu name; /me failure → chip stays inert', async () => {
    boot(MEMBER, { username: 'zed', ratings: {} });
    expect(document.querySelector('.pnav__who small').textContent).toBe('shell.unrated');
    await flush();
    expect(document.querySelector('.pnav__who small').textContent).toBe('shell.unrated');
    boot(MEMBER);
    global.fetch = jest.fn(() => Promise.reject(new Error('net')));
    window.PlatformShell.build('clubs');
    await flush();
    expect(document.querySelector('.pnav__item[role="menuitem"]').getAttribute('href')).toBe('#');
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

  it('guest → chip + menu (Cài đặt, Tạo tài khoản), no bell, no network call', () => {
    boot({ userId: 'g', isGuest: true, displayName: 'Guest' });
    expect(document.querySelector('.pnav__login')).toBeNull();
    expect(document.querySelector('.pbell')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(menuItems()).toEqual([['/settings.html', 'gset.title'], ['/login.html', 'gset.btn_create_account']]);
  });

  it('Settings menu link carries ?return= only when opened from a room', () => {
    window.history.replaceState(null, '', '/room.html?id=abc');
    boot({ userId: 'g', isGuest: true, displayName: 'Guest' });
    expect(menuItems()[0][0]).toBe('/settings.html?return=' + encodeURIComponent('/room.html?id=abc'));
    window.history.replaceState(null, '', '/');
  });

  it('member → chip menu: profile link set once /me answers; display name as text', async () => {
    boot({ userId: 'u', isGuest: false, displayName: '<i>Zed</i>' });
    await flush();
    const me = document.querySelector('.pnav__me');
    expect(me.textContent).toContain('<i>Zed</i>');
    expect(me.querySelector('i')).toBeNull();
    expect(menuItems().map((i) => i[0])).toEqual(['/u/zed', '/social.html', '/settings.html']); // #233: Bạn bè is reachable from the chip menu
  });

  it('chip shows the member avatar once /me returns one; initials otherwise (and until then)', async () => {
    boot(MEMBER, { username: 'zed', avatarUrl: '/api/profile/avatar/u.webp?v=2', ratings: {} });
    const av = document.querySelector('.pnav__me .pav');
    expect(av.textContent).toBe('ZE');
    await flush();
    expect(av.style.backgroundImage).toContain('/api/profile/avatar/u.webp?v=2');
    expect(av.textContent).toBe('');
    boot(MEMBER, { username: 'zed', avatarUrl: null, ratings: {} });
    await flush();
    expect(document.querySelector('.pnav__me .pav').textContent).toBe('ZE');
  });

  it('setMyAvatar() updates the chip at once (upload) and falls back to initials (remove); no-op without a chip', async () => {
    boot(MEMBER, { username: 'zed', avatarUrl: null, ratings: {} });
    await flush();
    const av = document.querySelector('.pnav__me .pav');
    window.PlatformShell.setMyAvatar('/api/profile/avatar/u.webp?v=9');
    expect(av.style.backgroundImage).toContain('v=9');
    expect(av.textContent).toBe('');
    window.PlatformShell.setMyAvatar(null);
    expect(av.style.backgroundImage).toBe('');
    expect(av.textContent).toBe('ZE');
    boot(null);
    expect(() => window.PlatformShell.setMyAvatar('/x')).not.toThrow();
  });

  it('menu opens/closes on chip click, outside click and Escape; aria-expanded follows', () => {
    boot(MEMBER);
    const me = document.querySelector('.pnav__me');
    const menu = document.querySelector('.pnav__menu');
    expect(menu.hidden).toBe(true);
    me.click();
    expect(menu.hidden).toBe(false);
    expect(me.getAttribute('aria-expanded')).toBe('true');
    document.body.click();
    expect(menu.hidden).toBe(true);
    me.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.hidden).toBe(true);
    expect(me.getAttribute('aria-expanded')).toBe('false');
  });

  it('Quản trị entry only appears for staff (admin.access), logout goes through GvnSession.logout', async () => {
    boot(null);
    window.GvnSession = { getUser: () => MEMBER, logout: jest.fn(() => Promise.resolve(false)) };
    global.fetch = jest.fn((url) => Promise.resolve({ ok: true, json: () => Promise.resolve(
      url === '/api/shell' ? { me: { username: 'zed' }, admin: { role: 'moderator', permissions: ['admin.access'] }, notifications: { items: [], unread: 0 } } : {}) }));
    window.PlatformShell.build('clubs');
    expect(document.querySelector('.pnav__item--staff').hidden).toBe(true); // hidden until /api/shell answers
    await flush();
    const staff = document.querySelector('.pnav__item--staff');
    expect(staff.hidden).toBe(false);
    expect(staff.getAttribute('href')).toBe('/admin');
    const out = [...document.querySelectorAll('.pnav__item')].find((n) => n.tagName === 'BUTTON');
    out.click();
    await flush();
    expect(window.GvnSession.logout).toHaveBeenCalled();
    expect(out.disabled).toBe(false); // failed logout leaves the user signed in and the button usable
  });

  it('B269: a member page makes ONE nav request (/api/shell); fetchMe() reuses its me, no /api/rankings/me', async () => {
    boot(null);
    window.GvnSession = { getUser: () => MEMBER };
    const calls = [];
    global.fetch = jest.fn((url) => {
      calls.push(url);
      return Promise.resolve({ ok: true, json: () => Promise.resolve(
        url === '/api/shell' ? { me: { username: 'zed', ratings: {} }, admin: { permissions: [] }, notifications: { items: [], unread: 2 } } : {}) });
    });
    window.PlatformShell.build('clubs');
    const r = await window.PlatformShell.fetchMe();
    expect(r.ok).toBe(true);
    expect((await r.json()).username).toBe('zed');
    await flush();
    expect(calls).toEqual(['/api/shell']);
    expect(window.PlatformShell.fetchMe()).toBeInstanceOf(Promise);
  });

  it('B269: fetchMe falls back to /api/rankings/me when the shell call fails; guests never call /api/shell', async () => {
    boot(null);
    window.GvnSession = { getUser: () => MEMBER };
    global.fetch = jest.fn((url) => (url === '/api/shell'
      ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) })
      : Promise.resolve({ ok: true, json: () => Promise.resolve({ username: 'direct' }) })));
    window.PlatformShell.build('clubs');
    expect((await (await window.PlatformShell.fetchMe()).json()).username).toBe('direct');
    expect(global.fetch.mock.calls.map((c) => c[0])).toContain('/api/rankings/me');
    window.GvnSession = { getUser: () => ({ userId: 'g', isGuest: true }) };
    global.fetch.mockClear();
    await window.PlatformShell.fetchMe();
    expect(global.fetch.mock.calls.map((c) => c[0])).toEqual(['/api/rankings/me']);
  });

  it('mode button flips colour mode through ui-mode.js', () => {
    boot(null);
    window.getColorMode = () => 'dark';
    window.setColorMode = jest.fn();
    document.querySelector('.pnav__mode').click();
    expect(window.setColorMode).toHaveBeenCalledWith('light');
  });

  it('right cluster follows the mockup order [mode][bell]…[me]; mode is a sun svg, not a text glyph', () => {
    boot(MEMBER, { username: 'zed', ratings: {} });
    const kids = [...document.querySelector('.pnav__right').children];
    expect(kids[0].classList.contains('pnav__mode')).toBe(true);
    expect(kids[1].classList.contains('pbell')).toBe(true);
    expect(kids[kids.length - 1].classList.contains('pnav__acct')).toBe(true);
    expect(kids).toHaveLength(3); // no gear: Settings is in the chip menu (B211)
    const mode = kids[0];
    expect(mode.textContent).toBe('');
    expect(mode.querySelector('svg circle')).not.toBeNull();
    expect(mode.querySelectorAll('svg line')).toHaveLength(8);
  });

  it('never adds a gear button even when the in-room settings panel is loaded', () => {
    window.openSettingsPanel = jest.fn();
    boot(MEMBER);
    expect(document.querySelectorAll('.pnav__mode')).toHaveLength(2); // mode + bell only
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

describe('club notifications (#235)', () => {
  const n = (type, extra = {}) => ({ id: 1, type, read: false, payload: { club: { slug: 'a b', name: 'Caro' }, from: { username: 'x', displayName: 'Xi' }, ...extra } });
  beforeEach(() => boot(null));

  it('text passes {name} and {club}; club notifications link to the club, requests to the manage tab', () => {
    window.t = (k, v) => k + JSON.stringify(v);
    expect(window.PlatformShell.notifications.text(n('club_invite'))).toBe('notif.club_invite{"name":"Xi","club":"Caro"}');
    expect(window.PlatformShell.notifications.target(n('club_invite'))).toBe('/c/a%20b');
    expect(window.PlatformShell.notifications.target(n('club_approved'))).toBe('/c/a%20b');
    expect(window.PlatformShell.notifications.target(n('club_request'))).toBe('/c/a%20b#tab=manage');
  });

  it('avatar takes tag + colour only when there is no image', () => {
    const a = window.PlatformShell.avatar(null, 'Caro Club', 'pav--sq', { color: 'teal', tag: 'CC' });
    expect([a.textContent, a.className]).toEqual(['CC', 'pav pav--sq pav--c-teal']);
    const b = window.PlatformShell.avatar('/x.png', 'Caro Club', '', { color: 'teal', tag: 'CC' });
    expect([b.textContent, b.className]).toEqual(['', 'pav']);
    expect(window.PlatformShell.avatar(null, 'Caro Club').textContent).toBe('CA');
  });
});
