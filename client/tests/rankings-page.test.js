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
    { rank: 1, userId: 'u2', username: 'bob', displayName: '<b>Bob</b>', rating: 1800, games: 25, provisional: false, delta7: 12, club: { slug: 'k-1', name: '<i>K1</i>' } },
    { rank: 2, userId: 'u1', username: 'alice', displayName: 'Alice', rating: 1700, games: 30, provisional: true, delta7: -5, club: null },
  ],
  pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
};
const ME = { userId: 'u1', minGames: 20, ratings: { freestyle: { rank: 2, rating: 1700, games: 30, total: 2 } } };

const flush = () => new Promise((r) => setTimeout(r, 0));

// rankings.js registers a DOMContentLoaded handler on every require; drop the previous
// boots' handlers so each test sees exactly one page instance.
const handlers = [];
const realAdd = document.addEventListener.bind(document);
document.addEventListener = (type, fn, ...rest) => { if (type === 'DOMContentLoaded') handlers.push(fn); return realAdd(type, fn, ...rest); };

async function boot(fetchImpl) {
  handlers.splice(0).forEach((fn) => document.removeEventListener('DOMContentLoaded', fn));
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

  it('shows the 7-day change (signed, coloured) and the club link; no club → dash', async () => {
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(PAGE)));
    const [bob, alice] = document.querySelectorAll('#rk-body tr');
    expect(bob.children[3].textContent).toBe('+12');
    expect(bob.children[3].classList.contains('up')).toBe(true);
    expect(alice.children[3].textContent).toBe('-5');
    expect(alice.children[3].classList.contains('dn')).toBe(true);
    const club = bob.children[4].querySelector('a');
    expect(club.textContent).toBe('<i>K1</i>');
    expect(club.querySelector('i')).toBeNull();
    expect(club.getAttribute('href')).toBe('/c/k-1');
    expect(alice.children[4].textContent).toBe('—');
  });

  it('typing in the search box re-queries with q (debounced) and resets to page 1', async () => {
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(PAGE)));
    const input = document.getElementById('rk-q');
    input.value = '  ali ';
    input.dispatchEvent(new Event('input'));
    input.value = 'alice';
    input.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 330)); // real debounce window
    const calls = global.fetch.mock.calls.map((c) => c[0]).filter((u) => u.includes('/api/rankings?'));
    expect(calls).toHaveLength(2); // initial + ONE debounced search
    expect(calls[1]).toContain('q=alice');
    expect(calls[1]).toContain('page=1');
  });

  it('works logged out (me → 401) and switches category via tab', async () => {
    await boot((url) => (url.includes('/me') ? Promise.resolve({ ok: false, status: 401 }) : ok(PAGE)));
    expect(document.getElementById('rk-mine').textContent).toBe('');
    [...document.querySelectorAll('.pchip')].find((c) => c.textContent === 'rankings.cat_caro').click();
    await flush();
    expect(global.fetch.mock.calls.pop()[0]).toContain('category=caro');
  });

  it('members get a Bạn bè scope tab that re-queries with scope=friends; guests/logged-out do not', async () => {
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(PAGE)));
    const chips = [...document.querySelectorAll('#rk-scope .ptab')];
    expect(chips.map((c) => c.textContent)).toEqual(['rankings.scope_all', 'rankings.scope_vn', 'rankings.scope_friends']);
    expect(chips[0].getAttribute('aria-selected')).toBe('true');
    chips[2].click();
    await flush();
    expect(global.fetch.mock.calls.pop()[0]).toContain('scope=friends');
    expect(location.search).toContain('scope=friends');

    await boot((url) => (url.includes('/me') ? ok({ ...ME, userId: null }) : ok(PAGE)));
    expect([...document.querySelectorAll('.ptab')].some((c) => c.textContent === 'rankings.scope_friends')).toBe(false);
  });

  it('everyone (even logged out) gets a Việt Nam scope tab that re-queries with scope=vn', async () => {
    await boot((url) => (url.includes('/me') ? Promise.resolve({ ok: false, status: 401 }) : ok(PAGE)));
    const chips = [...document.querySelectorAll('#rk-scope .ptab')];
    expect(chips.map((c) => c.textContent)).toEqual(['rankings.scope_all', 'rankings.scope_vn']);
    chips[1].click();
    await flush();
    expect(global.fetch.mock.calls.pop()[0]).toContain('scope=vn');
    expect(location.search).toContain('scope=vn');
  });

  it('renders the Khu vực cell as text: city, country name; — when unset', async () => {
    require('../js/countries.js');
    const page = { ...PAGE, players: [{ ...PAGE.players[0], city: '<i>HN</i>', country: 'VN' }, { ...PAGE.players[0], userId: 'x', username: 'x', city: '', country: '' }] };
    await boot((url) => (url.includes('/me') ? Promise.resolve({ ok: false, status: 401 }) : ok(page)));
    const cells = [...document.querySelectorAll('.ptbl__region')].map((c) => c.textContent);
    expect(cells[0].startsWith('<i>HN</i>, ')).toBe(true);
    expect(cells[1]).toBe('—');
    expect(document.querySelector('.ptbl__region i')).toBeNull();
  });

  it('shows the empty state', async () => {
    await boot((url) => (url.includes('/me') ? Promise.resolve({ ok: false }) : ok({ ...PAGE, players: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })));
    expect(document.getElementById('rk-empty').hidden).toBe(false);
  });
});
