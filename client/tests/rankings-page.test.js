/**
 * TODO.md #176 — rankings page: table render, own-row highlight, tabs, empty state.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/rankings.html"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BODY_HTML = fs.readFileSync(path.join(__dirname, '..', 'rankings.html'), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');

const PAGE = {
  category: 'freestyle', minGames: 20,
  players: [
    { rank: 1, userId: 'u2', username: 'bob', displayName: '<b>Bob</b>', rating: 1800, games: 25, provisional: false },
    { rank: 2, userId: 'u1', username: 'alice', displayName: 'Alice', rating: 1700, games: 30, provisional: true },
  ],
  pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
};
const ME = { userId: 'u1', minGames: 20, ratings: { freestyle: { rank: 2, rating: 1700, games: 30, total: 2 } } };

const flush = () => new Promise((r) => setTimeout(r, 0));

async function boot(fetchImpl) {
  jest.resetModules();
  document.body.innerHTML = BODY_HTML;
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  global.fetch = jest.fn(fetchImpl);
  require('../js/platform-shell.js');
  require('../js/rankings.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush(); await flush();
}

const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

describe('rankings page', () => {
  it('renders rows as text, highlights own row, shows own rank', async () => {
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(PAGE)));
    const rows = document.querySelectorAll('#rk-body tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('a').textContent).toBe('<b>Bob</b>');
    expect(rows[0].querySelector('b')).toBeNull();
    expect(rows[1].classList.contains('is-me')).toBe(true);
    expect(rows[1].querySelector('a').getAttribute('href')).toBe('/u/alice');
    expect(rows[1].querySelector('.ptbl__prov')).not.toBeNull();
    expect(document.getElementById('rk-mine').textContent).toContain('#2');
  });

  it('works logged out (me → 401) and switches category via tab', async () => {
    await boot((url) => (url.includes('/me') ? Promise.resolve({ ok: false, status: 401 }) : ok(PAGE)));
    expect(document.getElementById('rk-mine').textContent).toBe('');
    document.querySelectorAll('.pchip')[2].click();
    await flush();
    expect(global.fetch.mock.calls.pop()[0]).toContain('category=caro');
  });

  it('shows the empty state', async () => {
    await boot((url) => (url.includes('/me') ? Promise.resolve({ ok: false }) : ok({ ...PAGE, players: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })));
    expect(document.getElementById('rk-empty').hidden).toBe(false);
  });
});
