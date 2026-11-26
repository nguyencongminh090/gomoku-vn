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
