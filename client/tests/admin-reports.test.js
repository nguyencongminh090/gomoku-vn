/**
 * B210c — /admin "Tất cả báo cáo": forum + cheat queues merged into one table.
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
const reply = (status, body) => Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(body) });

const FORUM = { reports: [
  { type: 'post', excerpt: 'x'.repeat(80), targetDeleted: false, reporter: { displayName: 'An' }, createdAt: '2026-10-01T10:00:00Z' },
  { type: 'thread', excerpt: '', targetDeleted: true, reporter: { displayName: 'Bình' }, createdAt: '2026-10-03T10:00:00Z' },
], pagination: { total: 5 } };
const CHEAT = { reports: [
  { accused: { displayName: 'Cường' }, reporter: { displayName: 'Dũng' }, createdAt: '2026-10-02T10:00:00Z' },
], pagination: { total: 2 } };

function boot(routes) {
  jest.resetModules();
  document.body.innerHTML = HTML;
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  global.fetch = jest.fn((url) => {
    const hit = Object.keys(routes).find((k) => url.startsWith(k));
    return hit ? reply(routes[hit][0], routes[hit][1]) : reply(404, {});
  });
  require('../js/admin-reports.js');
  window.AdminReports.init();
  return settle();
}
const cells = () => [...document.querySelectorAll('#rl-table tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent));

describe('AdminReports', () => {
  it('merges both queues newest first, clips long excerpts, sums the open total', async () => {
    await boot({ '/api/forum/reports': [200, FORUM], '/api/admin/cheat-reports': [200, CHEAT] });
    const rows = cells();
    expect(rows.map((r) => r[1])).toEqual(['forum.deleted', 'Cường', 'x'.repeat(59) + '…']);
    expect(rows.map((r) => r[0])).toEqual(['admin.r_kind_forum', 'admin.r_kind_cheat', 'admin.r_kind_forum']);
    expect(rows[1][2]).toBe('Dũng');
    expect($('rl-total').textContent).toBe('admin.r_open{"n":7}');
    expect($('rl-msg').hidden).toBe(true);
    expect([...document.querySelectorAll('#rl-table th')].map((h) => h.textContent)).toEqual(
      ['admin.r_col_kind', 'admin.r_col_target', 'admin.r_col_reporter', 'admin.r_col_time', 'admin.r_col_review']);
  });

  it('"Xem xét" jumps to that queue\'s tab', async () => {
    await boot({ '/api/forum/reports': [200, FORUM], '/api/admin/cheat-reports': [200, CHEAT] });
    document.querySelectorAll('#rl-table tbody tr')[1].querySelector('button').click();
    expect(location.hash).toBe('#cheat');
    document.querySelectorAll('#rl-table tbody tr')[0].querySelector('button').click();
    expect(location.hash).toBe('#forum');
  });

  it('a queue the caller may not read (403) is skipped; both empty/forbidden → empty message, no table', async () => {
    await boot({ '/api/forum/reports': [403, {}], '/api/admin/cheat-reports': [200, CHEAT] });
    expect(cells().map((r) => r[1])).toEqual(['Cường']);
    expect($('rl-total').textContent).toBe('admin.r_open{"n":2}');
    await boot({ '/api/forum/reports': [403, {}], '/api/admin/cheat-reports': [403, {}] });
    expect(document.querySelector('#rl-table table')).toBeNull();
    expect($('rl-msg').hidden).toBe(false);
    expect($('rl-msg').textContent).toBe('admin.r_empty');
  });

  it('init is idempotent (tab re-shown does not refetch)', async () => {
    await boot({ '/api/forum/reports': [200, FORUM], '/api/admin/cheat-reports': [200, CHEAT] });
    const n = global.fetch.mock.calls.length;
    window.AdminReports.init();
    await settle();
    expect(global.fetch.mock.calls.length).toBe(n);
  });
});
