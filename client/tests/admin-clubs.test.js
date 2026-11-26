/**
 * B475 — /admin club report queue shows a report's prior bodies and what happened to the message later.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/admin"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin-clubs.js'), 'utf8');
const ESC = fs.readFileSync(path.join(__dirname, '..', 'js', 'escape-utils.js'), 'utf8');
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

const DIRECTORY = {
  clubs: [], total: 0, page: 1, history: [],
  reports: [
    { id: 1, slug: 'c', name: 'Club', reason: 'spam', excerpt: 'innocent',
      prior: [{ body: 'abuse', editedAt: '2026-11-26T01:00:00Z' }], later: { action: 'edited', body: 'good', at: '2026-11-26T02:00:00Z' } },
    { id: 2, slug: 'c', name: 'Club', reason: 'spam', excerpt: 'worse', prior: null, later: { action: 'deleted', at: '2026-11-26T03:00:00Z' } },
    { id: 3, slug: 'c', name: 'Club', reason: 'spam', excerpt: 'plain', prior: null, later: null },
  ],
};

test('report rows list prior bodies and the later edit/delete; untouched reports add nothing', async () => {
  document.body.innerHTML = HTML;
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(DIRECTORY) }));
  window.eval(SRC);
  window.AdminClubs.init();
  await settle();
  const rows = [...document.getElementById('ac-reports').children];
  const notes = rows.map((r) => [...r.querySelectorAll('.pnote')].map((p) => p.textContent));
  expect(notes[0]).toEqual(['Bản trước: abuse', 'Sau báo cáo, đã sửa thành: good']);
  expect(notes[1]).toHaveLength(1);
  expect(notes[1][0]).toMatch(/^Sau báo cáo, đã xoá lúc /);
  expect(notes[2]).toEqual([]);
});

// B481: club bodies are stored escaped (DmText.clean, `<` → `&lt;`); the queue must decode them for
// display, as text — never as markup.
test('report excerpt, prior and later bodies decode &lt;/&gt; and render as text, not elements', async () => {
  document.body.innerHTML = HTML;
  const enc = '15 phút &lt;b&gt;sửa&lt;/b&gt;';
  const dir = { ...DIRECTORY, reports: [{ id: 9, slug: 'c', name: 'Club', reason: 'spam', excerpt: enc,
    prior: [{ body: enc, editedAt: '2026-11-26T01:00:00Z' }], later: { action: 'edited', body: enc, at: '2026-11-26T02:00:00Z' } }] };
  global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(dir) }));
  window.eval(ESC);
  window.eval(SRC);
  window.AdminClubs.init();
  await settle();
  const row = document.getElementById('ac-reports').children[0];
  expect(row.firstChild.textContent).toBe('Club · spam · 15 phút <b>sửa</b>');
  expect([...row.querySelectorAll('.pnote')].map((p) => p.textContent))
    .toEqual(['Bản trước: 15 phút <b>sửa</b>', 'Sau báo cáo, đã sửa thành: 15 phút <b>sửa</b>']);
  expect(row.querySelector('b')).toBeNull();
  expect(row.textContent).not.toMatch(/&lt;|&gt;/);
});

test('admin.html loads escape-utils.js before admin-clubs.js', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  const esc = page.indexOf('js/escape-utils.js');
  expect(esc).toBeGreaterThan(-1);
  expect(esc).toBeLessThan(page.indexOf('js/admin-clubs.js'));
});

// B481 follow-up: the club detail message list printed the stored (escaped) body raw too.
test('club detail message list decodes &lt;/&gt; and renders as text, not elements', async () => {
  document.body.innerHTML = HTML;
  const dir = { ...DIRECTORY, total: 1, clubs: [{ slug: 'c', name: 'Club' }], reports: [] };
  const club = { name: 'Club', description: 'd', hidden: false, locked: false, log: [],
    messages: [{ id: 5, username: 'ann', body: '15 phút &lt;b&gt;sửa&lt;/b&gt;', kind: 'text' }, { id: 6, username: 'bob', body: '', kind: 'poll' }, { id: 7, username: 'cy', body: null, kind: 'pin' }] };
  global.fetch = jest.fn((url) => Promise.resolve({ ok: true, status: 200,
    json: () => Promise.resolve(url.startsWith('/api/admin/clubs/c') ? club : dir) }));
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.eval(ESC);
  window.eval(SRC);
  window.AdminClubs.init();
  await settle();
  document.querySelector('#ac-list button').click();
  await settle();
  const rows = [...document.querySelectorAll('#ac-detail .prow')];
  expect(rows.map((r) => r.firstChild.textContent)).toEqual(['ann · 15 phút <b>sửa</b>', 'bob · poll', 'cy · pin']);
  expect(document.querySelector('#ac-detail b')).toBeNull();
});
