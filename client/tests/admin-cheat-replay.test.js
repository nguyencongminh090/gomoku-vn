/**
 * TODO.md #208 — replay report form + /admin cheat tab.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/replay/g1"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const body = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const REPLAY = body('replay.html');
const ADMIN = body('admin.html');
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const $ = (id) => document.getElementById(id);
const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });
const fail = (status, b) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(b || {}) });

const handlers = [];
const realAdd = document.addEventListener.bind(document);
document.addEventListener = (type, fn, ...rest) => { if (type === 'DOMContentLoaded') handlers.push(fn); return realAdd(type, fn, ...rest); };

function bootReplay({ user, url = '/replay/g1', fetchImpl }) {
  handlers.splice(0).forEach((fn) => document.removeEventListener('DOMContentLoaded', fn));
  jest.resetModules();
  window.history.pushState({}, '', url);
  document.body.innerHTML = REPLAY;
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  window.GvnSession = { getUser: () => user };
  global.fetch = jest.fn(fetchImpl || (() => ok({ ok: true })));
  require('../js/replay-report.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
}

describe('replay report form', () => {
  it('hidden for guests, anonymous visitors and tournament replays', () => {
    bootReplay({ user: null });
    expect($('replay-report').hidden).toBe(true);
    bootReplay({ user: { userId: 'g', isGuest: true } });
    expect($('replay-report').hidden).toBe(true);
    bootReplay({ user: { userId: 'u', isGuest: false }, url: '/replay/g1?source=tournament' });
    expect($('replay-report').hidden).toBe(true);
  });

  it('a member opens the form, sends side + reason, sees the confirmation', async () => {
    bootReplay({ user: { userId: 'u', isGuest: false } });
    expect($('replay-report').hidden).toBe(false);
    $('replay-white').textContent = '○ Wanda';
    $('rr-open').click();
    expect($('rr-form').hidden).toBe(false);
    expect($('rr-white').textContent).toBe('replay.report_white{"name":"Wanda"}');
    $('rr-side').value = 'WHITE';
    $('rr-reason').value = 'engine';
    $('rr-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/games/g1/report');
    expect(JSON.parse(opts.body)).toEqual({ side: 'WHITE', reason: 'engine' });
    expect($('rr-msg').textContent).toBe('replay.report_sent');
    expect($('rr-reason').value).toBe('');
  });

  it('a server error code is shown translated', async () => {
    bootReplay({ user: { userId: 'u', isGuest: false }, fetchImpl: () => fail(400, { code: 'CHEAT_SELF' }) });
    $('rr-open').click();
    $('rr-reason').value = 'x';
    $('rr-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect($('rr-msg').textContent).toBe('err.cheat_self');
  });
});

describe('admin cheat tab', () => {
  const R = (id) => ({
    id, reason: '<b>engine</b>', createdAt: '2026-10-10T00:00:00.000Z',
    accused: { id: 'bob', username: 'bob', displayName: 'Bob' }, reporter: { displayName: 'Carol' },
    game: { id: 'g1', black: 'A', white: 'B', accusedSide: 'WHITE' }, accusedOpenGames: 2, accusedConfirmedGames: 1,
  });
  function bootAdmin(impl) {
    jest.resetModules();
    document.body.innerHTML = ADMIN;
    window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
    window.Forum = { pager: jest.fn() };
    window.alert = jest.fn();
    global.fetch = jest.fn(impl);
    require('../js/admin-cheat.js');
    window.AdminCheat.init();
  }

  it('renders reports as text with a replay link, and resolves with confirm true/false', async () => {
    const posts = [];
    bootAdmin((u, o = {}) => {
      if (o.method === 'POST') { posts.push([u, JSON.parse(o.body)]); return ok({ ok: true }); }
      return ok({ reports: [R('r1')], pagination: { total: 1, page: 1, totalPages: 1 } });
    });
    await settle();
    const row = document.querySelector('#ch-list .prow');
    expect(row.textContent).toContain('<b>engine</b>');
    expect(row.querySelector('b').textContent).toBe('Bob');
    expect(row.querySelector('a').getAttribute('href')).toBe('/replay/g1');
    const [dismiss, confirm] = row.querySelectorAll('button');
    dismiss.click(); await settle();
    confirm.click(); await settle();
    expect(posts).toEqual([['/api/admin/cheat-reports/r1/resolve', { confirm: false }], ['/api/admin/cheat-reports/r1/resolve', { confirm: true }]]);
  });

  it('403 shows the error; empty list shows the empty note', async () => {
    bootAdmin(() => fail(403, { code: 'CHEAT_FORBIDDEN' }));
    await settle();
    expect($('ch-msg').textContent).toBe('err.cheat_forbidden');
    bootAdmin(() => ok({ reports: [], pagination: { total: 0, page: 1, totalPages: 0 } }));
    await settle();
    expect($('ch-msg').hidden).toBe(false);
    expect($('ch-msg').textContent).toBe('admin.c_empty');
  });
});
