/**
 * TODO.md #205 (R8) — /admin shell: which tabs a role sees, hash routing, lazy tab start.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/admin"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const $ = (id) => document.getElementById(id);

const handlers = [];
const realAdd = document.addEventListener.bind(document);
document.addEventListener = (type, fn, ...rest) => { if (type === 'DOMContentLoaded') handlers.push(fn); return realAdd(type, fn, ...rest); };

const hashListeners = [];
const realWinAdd = window.addEventListener.bind(window);
window.addEventListener = (type, fn, ...rest) => { if (type === 'hashchange') hashListeners.push(fn); return realWinAdd(type, fn, ...rest); };

const ME = {
  member: { role: 'member', permissions: [] },
  moderator: { role: 'moderator', permissions: ['puzzle.review', 'forum.moderate', 'admin.access'] },
  cheatOnly: { role: 'moderator', permissions: ['cheat.review'] },
  puzzleOnly: { role: 'moderator', permissions: ['puzzle.review'] },
};

async function boot(me, status = 200, hash = '', failFetch = false) {
  handlers.splice(0).forEach((fn) => document.removeEventListener('DOMContentLoaded', fn));
  hashListeners.splice(0).forEach((fn) => window.removeEventListener('hashchange', fn));
  jest.resetModules();
  window.history.pushState({}, '', '/admin' + hash);
  document.body.innerHTML = HTML;
  window.t = (k) => k;
  window.PlatformShell = { build: jest.fn() };
  window.PuzzlesReview = { init: jest.fn() };
  window.ForumReports = { init: jest.fn() };
  window.AdminReports = { init: jest.fn() };
  global.fetch = jest.fn(() => failFetch ? Promise.reject(new Error('down')) : Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(me) }));
  require('../js/admin.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await settle();
}

describe('admin shell — Tất cả báo cáo tab (B210c)', () => {
  it('shown for forum.moderate or cheat.review (any-of), hidden for puzzle-only staff', async () => {
    await boot(ME.moderator);
    expect($('adm-tab-reports').hidden).toBe(false);
    await boot(ME.cheatOnly);
    expect($('adm-tab-reports').hidden).toBe(false);
    await boot(ME.puzzleOnly);
    expect($('adm-tab-reports').hidden).toBe(true);
  });
});

describe('admin shell', () => {
  it('highlights no nav item (admin is not the Learn section)', async () => {
    await boot(ME.moderator);
    expect(window.PlatformShell.build).toHaveBeenCalledWith('admin');
  });

  it('a member sees the forbidden message and no tabs', async () => {
    await boot(ME.member);
    expect($('adm-msg').hidden).toBe(false);
    expect($('adm-msg').textContent).toBe('admin.forbidden');
    expect($('adm-tabs').hidden).toBe(true);
    expect(window.PuzzlesReview.init).not.toHaveBeenCalled();
    expect(window.ForumReports.init).not.toHaveBeenCalled();
  });

  it('a guest / logged-out visitor is told to log in', async () => {
    await boot({}, 403);
    expect($('adm-msg').textContent).toBe('admin.login');
  });

  it('a moderator sees both tabs, starts the first one only', async () => {
    await boot(ME.moderator);
    expect($('adm-tab-puzzles').hidden).toBe(false);
    expect($('adm-tab-forum').hidden).toBe(false);
    expect($('adm-puzzles').hidden).toBe(false);
    expect($('adm-forum').hidden).toBe(true);
    expect(window.PuzzlesReview.init).toHaveBeenCalledTimes(1);
    expect(window.ForumReports.init).not.toHaveBeenCalled();
    expect($('adm-role').textContent).toBe('admin.role_moderator');
  });

  it('#forum opens the forum tab; clicking a tab switches via the hash', async () => {
    await boot(ME.moderator, 200, '#forum');
    expect($('adm-forum').hidden).toBe(false);
    expect($('adm-tab-forum').getAttribute('aria-selected')).toBe('true');
    expect(window.ForumReports.init).toHaveBeenCalledTimes(1);
    $('adm-tab-puzzles').click();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect($('adm-puzzles').hidden).toBe(false);
    expect($('adm-forum').hidden).toBe(true);
    expect(window.PuzzlesReview.init).toHaveBeenCalledTimes(1);
  });

  it('only the permitted tab shows, and a hash for a hidden tab falls back to it', async () => {
    await boot(ME.puzzleOnly, 200, '#forum');
    expect($('adm-tab-forum').hidden).toBe(true);
    expect($('adm-puzzles').hidden).toBe(false);
    expect(window.ForumReports.init).not.toHaveBeenCalled();
  });

  it('tab labels carry the open-queue counts of the tabs the caller may see (mockup "Báo cáo (7)")', async () => {
    const body = (url) => (url === '/api/admin/me' ? ME.moderator
      : { pagination: { total: url.startsWith('/api/forum/reports') ? 7 : 3 } });
    handlers.splice(0).forEach((fn) => document.removeEventListener('DOMContentLoaded', fn));
    hashListeners.splice(0).forEach((fn) => window.removeEventListener('hashchange', fn));
    jest.resetModules();
    window.history.pushState({}, '', '/admin');
    document.body.innerHTML = HTML;
    window.t = (k) => k;
    window.PlatformShell = { build: jest.fn() };
    window.PuzzlesReview = { init: jest.fn() };
    window.ForumReports = { init: jest.fn() };
  window.AdminReports = { init: jest.fn() };
    global.fetch = jest.fn((url) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body(url)) }));
    require('../js/admin.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await settle();
    expect($('adm-tab-puzzles').querySelector('.ptab__n').textContent).toBe(' (3)');
    expect($('adm-tab-forum').querySelector('.ptab__n').textContent).toBe(' (7)');
    expect($('adm-tab-cheat').querySelector('.ptab__n')).toBeNull(); // no cheat.review permission → not fetched
    expect(global.fetch.mock.calls.map((c) => c[0])).not.toContain('/api/admin/cheat-reports?page=1');
    expect($('adm-tab-puzzles').textContent).toBe('Duyệt puzzle (3)');
    expect($('adm-tab-puzzles').querySelector('[data-i18n="admin.tab_puzzles"]')).not.toBeNull(); // label is its own span, so a language switch keeps the count
  });

  it('a network failure reports an error instead of leaving a blank page', async () => {
    await boot(ME.member, 200, '', true);
    expect($('adm-msg').textContent).toBe('admin.error');
  });
});
