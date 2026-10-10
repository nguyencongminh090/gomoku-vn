/**
 * TODO.md #203 (7c) — forum list, thread, reports pages.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/forum"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const body = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const HTML = { list: body('forum.html'), thread: body('forum-thread.html'), reports: body('admin.html') };

const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });
const fail = (status, b) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(b || {}) });
const $ = (id) => document.getElementById(id);

const handlers = [];
const realAdd = document.addEventListener.bind(document);
document.addEventListener = (type, fn, ...rest) => { if (type === 'DOMContentLoaded') handlers.push(fn); return realAdd(type, fn, ...rest); };

function boot(page, script, fetchImpl, url) {
  handlers.splice(0).forEach((fn) => document.removeEventListener('DOMContentLoaded', fn));
  jest.resetModules();
  window.history.pushState({}, '', url);
  document.body.innerHTML = HTML[page];
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  window.PlatformShell = { build: jest.fn() };
  global.fetch = jest.fn(fetchImpl);
  window.confirm = jest.fn(() => true);
  window.alert = jest.fn();
  require('../js/forum-common.js');
  require(script);
  if (window.ForumReports) window.ForumReports.init(); // a tab of /admin: admin.js starts it
  document.dispatchEvent(new Event('DOMContentLoaded'));
}
const calls = (frag, method) => global.fetch.mock.calls.filter(([u, o]) => u.includes(frag) && (!method || (o && o.method) === method));
const member = (u) => (u.includes('/rankings/me') ? ok({ userId: 'u1' }) : null);
const guest = (u) => (u.includes('/rankings/me') ? fail(401) : null);

const THREADS = {
  threads: [{ id: 't1', category: 'tactics', title: '<b>Khai cuộc</b>', author: { username: 'a', displayName: 'Al' }, createdAt: '2026-10-10T00:00:00Z', lastPostAt: '2026-10-10T01:00:00Z', replyCount: 3, deleted: false }],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }, canModerate: false,
};

describe('list page', () => {
  const listBoot = (over, url = '/forum') => boot('list', '../js/forum.js', (u, o) => (over && over(u, o)) || member(u) || ok(THREADS), url);

  it('renders threads as text linking to /forum/t/<id>', async () => {
    listBoot(); await settle();
    const row = document.querySelector('#fm-list .fm-row');
    expect(row.getAttribute('href')).toBe('/forum/t/t1');
    expect(row.querySelector('.fm-row__title').textContent).toBe('<b>Khai cuộc</b>');
    expect(row.querySelector('b')).toBeNull();
    expect(row.textContent).toContain('forum.replies{"n":3}');
  });

  it('a category chip re-queries with it; the all chip clears it', async () => {
    listBoot(); await settle();
    const chip = [...document.querySelectorAll('#fm-cats .pchip')].find((b) => b.textContent === 'forum.cat_help');
    chip.click(); await settle();
    expect(global.fetch.mock.calls.pop()[0]).toBe('/api/forum/threads?category=help');
    [...document.querySelectorAll('#fm-cats .pchip')][0].click(); await settle();
    expect(global.fetch.mock.calls.pop()[0]).toBe('/api/forum/threads?');
  });

  it('guests see the login hint and no new-thread button; members see the button', async () => {
    listBoot((u) => guest(u)); await settle();
    expect($('fm-new-btn').hidden).toBe(true);
    expect($('fm-login').hidden).toBe(false);
    listBoot(); await settle();
    expect($('fm-new-btn').hidden).toBe(false);
    expect($('fm-login').hidden).toBe(true);
  });

  it('only staff get the reports link', async () => {
    listBoot((u) => (u.includes('/api/forum/threads') ? ok({ ...THREADS, canModerate: true }) : null)); await settle();
    expect($('fm-reports').hidden).toBe(false);
    listBoot(); await settle();
    expect($('fm-reports').hidden).toBe(true);
  });

  it('posting sends the form and shows the translated server error', async () => {
    listBoot((u, o) => (o && o.method === 'POST' ? fail(429, { code: 'FORUM_RATE_LIMITED' }) : null)); await settle();
    $('fm-new-btn').click();
    expect($('fm-new').hidden).toBe(false);
    $('fm-new-cat').value = 'help'; $('fm-new-title').value = 'T'; $('fm-new-body').value = 'B';
    $('fm-new').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(JSON.parse(calls('/api/forum/threads', 'POST')[0][1].body)).toEqual({ category: 'help', title: 'T', body: 'B' });
    expect($('fm-new-result').textContent).toBe('err.forum_rate_limited');
    expect($('fm-new-submit').disabled).toBe(false);
  });
});

describe('thread page', () => {
  const TH = (over = {}) => ({
    thread: { id: 't1', category: 'help', title: '<i>Tiêu đề</i>', body: 'dòng 1\n<b>dòng 2</b>', author: { username: 'a', displayName: 'Al' }, createdAt: '2026-10-10T00:00:00Z', replyCount: 2, deleted: false },
    posts: [
      { id: 'p1', author: { username: 'b', displayName: 'Bo' }, body: '<u>hi</u>', createdAt: '2026-10-10T00:10:00Z', deleted: false },
      { id: 'p2', author: { username: 'c', displayName: 'Cy' }, body: '', createdAt: '2026-10-10T00:20:00Z', deleted: true },
    ],
    pagination: { page: 1, limit: 30, total: 2, totalPages: 1 }, canModerate: false, ...over,
  });
  const threadBoot = (over, data) => boot('thread', '../js/forum-thread.js', (u, o) => (over && over(u, o)) || member(u) || ok(data || TH()), '/forum/t/t1');

  it('renders title/body/replies as text; a deleted reply shows the placeholder, not a body', async () => {
    threadBoot(); await settle();
    expect($('th-title').textContent).toBe('<i>Tiêu đề</i>');
    expect($('th-title').querySelector('i')).toBeNull();
    expect($('th-body').textContent).toBe('dòng 1\n<b>dòng 2</b>');
    const posts = document.querySelectorAll('#th-posts .fm-post');
    expect(posts[0].querySelector('.fm-text').textContent).toBe('<u>hi</u>');
    expect(posts[0].querySelector('u')).toBeNull();
    expect(posts[1].classList.contains('is-deleted')).toBe(true);
    expect(posts[1].textContent).toContain('forum.deleted');
  });

  it('a missing thread shows the translated error', async () => {
    threadBoot((u) => (u.includes('/api/forum/threads/t1') ? fail(404, { code: 'FORUM_NOT_FOUND' }) : null)); await settle();
    expect($('th-error').textContent).toBe('err.forum_not_found');
    expect($('th-view').hidden).toBe(true);
  });

  it('guests: no reply form, no report/delete buttons', async () => {
    threadBoot((u) => guest(u)); await settle();
    expect($('th-form').hidden).toBe(true);
    expect($('th-login').hidden).toBe(false);
    expect(document.querySelectorAll('.fm-post button, #th-actions button')).toHaveLength(0);
  });

  it('a member replies (POST) and the page reloads at the last page', async () => {
    threadBoot((u, o) => (o && o.method === 'POST' ? ok({ id: 'p9' }) : null)); await settle();
    expect($('th-form').hidden).toBe(false);
    $('th-reply').value = 'Cảm ơn';
    $('th-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(JSON.parse(calls('/threads/t1/posts', 'POST')[0][1].body)).toEqual({ body: 'Cảm ơn' });
    expect($('th-reply').value).toBe('');
    expect(global.fetch.mock.calls.pop()[0]).toContain('?page=1');
  });

  it('report: reason box → POST /report {type, id, reason}; thread and reply are both reportable', async () => {
    threadBoot((u, o) => (o && o.method === 'POST' ? ok({ ok: true }) : null)); await settle();
    document.querySelector('.fm-post .pactions button').click(); // first reply's Report
    const box = document.querySelector('.fm-post .fm-reportbox');
    box.querySelector('input').value = 'spam';
    box.querySelectorAll('button')[0].click();
    await settle();
    expect(JSON.parse(calls('/api/forum/report', 'POST')[0][1].body)).toEqual({ type: 'post', id: 'p1', reason: 'spam' });
    expect(box.textContent).toContain('forum.reported');
    document.querySelector('#th-actions button').click();
    expect(document.querySelector('.fm-op .fm-reportbox')).not.toBeNull();
  });

  it('staff see Delete: a reply is deleted after confirm and the thread reloads; declining sends nothing', async () => {
    threadBoot((u, o) => (o && o.method === 'DELETE' ? ok({ ok: true }) : null), TH({ canModerate: true })); await settle();
    window.confirm.mockReturnValueOnce(false);
    [...document.querySelectorAll('.fm-post .pactions button')].find((b) => b.textContent === 'forum.delete').click();
    await settle();
    expect(calls('/api/forum/posts/', 'DELETE')).toHaveLength(0);
    [...document.querySelectorAll('.fm-post .pactions button')].find((b) => b.textContent === 'forum.delete').click();
    await settle();
    expect(calls('/api/forum/posts/p1', 'DELETE')).toHaveLength(1);
  });
});

describe('reports page', () => {
  const R = {
    reports: [
      { id: 'r1', type: 'post', targetId: 'p1', threadId: 't1', reason: '<b>spam</b>', createdAt: '2026-10-10T00:00:00Z', reporter: { username: 'x', displayName: 'Xi' }, excerpt: '<i>quảng cáo</i>', targetDeleted: false },
      { id: 'r2', type: 'thread', targetId: 't2', threadId: 't2', reason: 'r', createdAt: '2026-10-10T00:00:00Z', reporter: { username: 'x', displayName: 'Xi' }, excerpt: '', targetDeleted: true },
    ],
    pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
  };
  const repBoot = (over) => boot('reports', '../js/forum-reports.js', (u, o) => (over && over(u, o)) || ok(R), '/forum/reports');

  it('lists reports as text with a thread link; a deleted target has no remove button', async () => {
    repBoot(); await settle();
    const rows = document.querySelectorAll('#rp-list .fm-report');
    expect(rows[0].querySelector('.fm-report__excerpt').textContent).toBe('<i>quảng cáo</i>');
    expect(rows[0].querySelector('i')).toBeNull();
    expect(rows[0].querySelector('a').getAttribute('href')).toBe('/forum/t/t1');
    expect(rows[0].querySelectorAll('.pactions button')).toHaveLength(2);
    expect(rows[1].querySelectorAll('.pactions button')).toHaveLength(1);
  });

  it('dismiss and remove post {remove:false|true} and reload', async () => {
    repBoot((u, o) => (o && o.method === 'POST' ? ok({ ok: true }) : null)); await settle();
    const [dismiss, remove] = document.querySelectorAll('#rp-list .fm-report')[0].querySelectorAll('.pactions button');
    dismiss.click(); await settle();
    expect(JSON.parse(calls('/reports/r1/resolve', 'POST')[0][1].body)).toEqual({ remove: false });
    remove.click(); await settle();
    expect(JSON.parse(calls('/reports/r1/resolve', 'POST')[1][1].body)).toEqual({ remove: true });
  });

  it('a non-staff visitor sees the server message and no list', async () => {
    repBoot((u) => fail(403, { code: 'FORUM_FORBIDDEN' })); await settle();
    expect($('rp-msg').textContent).toBe('err.forum_forbidden');
    expect(document.querySelectorAll('#rp-list .fm-report')).toHaveLength(0);
  });
});
