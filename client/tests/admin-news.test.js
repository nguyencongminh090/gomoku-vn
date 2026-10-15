/**
 * TODO.md #224 — /admin "Tin tức" tab (admin-news.js): tab only for news.manage, list/create/edit/delete,
 * server error codes shown, text rendered with textContent.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/admin#news"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const HTML = read('admin.html').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const SHELL = read('js/admin.js');
const NEWS = read('js/admin-news.js');
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await flush(); };
const $ = (id) => document.getElementById(id);

const ADMIN = { role: 'admin', permissions: ['puzzle.review', 'forum.moderate', 'admin.access', 'cheat.review', 'user.manage', 'news.manage'] };
const MOD = { role: 'moderator', permissions: ['puzzle.review', 'forum.moderate', 'admin.access', 'cheat.review'] };
const ITEM = (id, body, link = null) => ({ id, body, link, createdAt: '2026-10-12T00:00:00.000Z', updatedAt: '2026-10-12T00:00:00.000Z' });

let items;
let calls;
let failNext;

function respond(url, opts = {}) {
  const method = opts.method || 'GET';
  calls.push([method, url, opts.body ? JSON.parse(opts.body) : undefined]);
  const ok = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(data) });
  if (url === '/api/admin/me') return ok(window.__me);
  if (failNext) { const f = failNext; failNext = null; return ok({ code: f }, 400); }
  if (url === '/api/admin/news' && method === 'GET') return ok({ items });
  if (url === '/api/admin/news' && method === 'POST') { const it = ITEM('n' + (items.length + 1), JSON.parse(opts.body).body); items.unshift(it); return ok({ item: it }, 201); }
  const m = /^\/api\/admin\/news\/(.+)$/.exec(url);
  if (m && method === 'PUT') { const it = items.find((x) => x.id === m[1]); it.body = JSON.parse(opts.body).body; return ok({ item: it }); }
  if (m && method === 'DELETE') { items = items.filter((x) => x.id !== m[1]); return ok({ ok: true }); }
  return ok({}, 404);
}

async function boot(me) {
  window.__me = me;
  calls = [];
  failNext = null;
  document.body.innerHTML = HTML;
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  window.PlatformShell = { build: jest.fn() };
  for (const k of ['PuzzlesReview', 'ForumReports', 'AdminReports', 'AdminUsers', 'AdminCheat']) window[k] = { init: jest.fn() };
  global.fetch = jest.fn(respond);
  window.confirm = jest.fn(() => true);
  window.eval(NEWS);
  window.eval(SHELL);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await settle();
}

const titles = () => [...document.querySelectorAll('#nw-list .prow__t')].map((n) => n.textContent);

beforeEach(() => { items = [ITEM('a', '<b>Old</b>', '/forum'), ITEM('b', 'Older')]; });

describe('admin news tab', () => {
  it('moderator: no news tab, no news request', async () => {
    await boot(MOD);
    expect($('adm-tab-news').hidden).toBe(true);
    expect(calls.map((c) => c[1])).not.toContain('/api/admin/news');
  });

  it('admin: tab shown; list newest first, first marked live, text not parsed as HTML', async () => {
    await boot(ADMIN);
    expect($('adm-tab-news').hidden).toBe(false);
    expect($('adm-news').hidden).toBe(false);
    expect(titles()).toEqual(['<b>Old</b>', 'Older']);
    expect($('nw-list').querySelector('b')).toBeNull();
    const metas = [...document.querySelectorAll('#nw-list .prow__meta')].map((n) => [...n.children].map((s) => s.textContent));
    expect(metas[0][0]).toBe('admin.n_live');
    expect(metas[0][metas[0].length - 1]).toBe('/forum');
    expect(metas[0].length).toBe(3); // separate spans, not one joined string
    expect(metas[1][0]).not.toBe('admin.n_live');
  });

  it('publish posts {body, link} and reloads; form resets', async () => {
    await boot(ADMIN);
    $('nw-body').value = 'Giải mới';
    $('nw-link').value = '  /tournament?id=1 ';
    $('nw-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(calls.find((c) => c[0] === 'POST')).toEqual(['POST', '/api/admin/news', { body: 'Giải mới', link: '/tournament?id=1' }]);
    expect(titles()[0]).toBe('Giải mới');
    expect($('nw-body').value).toBe('');
  });

  it('edit fills the form, PUTs to that id, cancel returns to publish mode', async () => {
    await boot(ADMIN);
    document.querySelector('#nw-list .prow .pbtn').click(); // Sửa on the first row
    expect($('nw-body').value).toBe('<b>Old</b>');
    expect($('nw-link').value).toBe('/forum');
    expect($('nw-save').textContent).toBe('admin.n_update');
    expect($('nw-cancel').hidden).toBe(false);
    $('nw-body').value = 'Fixed';
    $('nw-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(calls.find((c) => c[0] === 'PUT')).toEqual(['PUT', '/api/admin/news/a', { body: 'Fixed', link: '/forum' }]);
    expect(titles()[0]).toBe('Fixed');
    expect($('nw-save').textContent).toBe('admin.n_publish');

    document.querySelector('#nw-list .prow .pbtn').click();
    $('nw-cancel').click();
    expect($('nw-body').value).toBe('');
    expect($('nw-cancel').hidden).toBe(true);
  });

  it('delete asks first; declining sends nothing', async () => {
    await boot(ADMIN);
    window.confirm = jest.fn(() => false);
    document.querySelectorAll('#nw-list .prow')[1].querySelectorAll('.pbtn')[1].click();
    await settle();
    expect(calls.some((c) => c[0] === 'DELETE')).toBe(false);
    window.confirm = jest.fn(() => true);
    document.querySelectorAll('#nw-list .prow')[1].querySelectorAll('.pbtn')[1].click();
    await settle();
    expect(calls.find((c) => c[0] === 'DELETE')[1]).toBe('/api/admin/news/b');
    expect(titles()).toEqual(['<b>Old</b>']);
  });

  it('server validation error is shown and the form keeps its text', async () => {
    await boot(ADMIN);
    $('nw-body').value = 'x';
    $('nw-link').value = '//evil';
    failNext = 'NEWS_LINK_INVALID';
    $('nw-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect($('nw-msg').hidden).toBe(false);
    expect($('nw-msg').textContent).toBe('err.news_link_invalid');
    expect($('nw-link').value).toBe('//evil');
    expect($('nw-save').disabled).toBe(false);
  });

  it('empty list → empty note', async () => {
    items = [];
    await boot(ADMIN);
    expect($('nw-list').textContent).toBe('admin.n_empty');
  });
});
