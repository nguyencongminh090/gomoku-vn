/**
 * TODO.md #176 — rankings page: table render, own-row highlight, tabs, empty state.
 * #374 — podium (rank 1–3), split-flap ratings, ticker, dock, 5 s opening (once/session, skip, reduced-motion).
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
    { rank: 4, userId: 'u2', username: 'bob', displayName: '<b>Bob</b>', rating: 1800, games: 25, provisional: false, delta7: 12, club: { slug: 'k-1', name: '<i>K1</i>' } },
    { rank: 5, userId: 'u1', username: 'alice', displayName: 'Alice', rating: 1700, games: 30, provisional: true, delta7: -5, club: null },
  ],
  pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
};
const ME = { userId: 'u1', minGames: 20, ratings: { freestyle: { rank: 2, rating: 1700, games: 30, total: 2 } } };

let fakeTimers = false; // under jest fake timers, flush by advancing them (a real setTimeout(0) would never fire)
const flush = () => (fakeTimers ? jest.advanceTimersByTimeAsync(1) : new Promise((r) => setTimeout(r, 0)));

// rankings.js registers a DOMContentLoaded handler on every require; drop the previous
// boots' handlers so each test sees exactly one page instance.
const handlers = [];
const realAdd = document.addEventListener.bind(document);
document.addEventListener = (type, fn, ...rest) => { if (type === 'DOMContentLoaded') handlers.push(fn); return realAdd(type, fn, ...rest); };

async function boot(fetchImpl) {
  handlers.splice(0).forEach((fn) => document.removeEventListener('DOMContentLoaded', fn));
  document.documentElement.classList.remove('rk-intro');
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
    expect(bob.children[4].textContent).toBe('+12');
    expect(bob.children[4].classList.contains('up')).toBe(true);
    expect(alice.children[4].textContent).toBe('-5');
    expect(alice.children[4].classList.contains('dn')).toBe(true);
    const club = bob.children[5].querySelector('a');
    expect(club.textContent).toBe('<i>K1</i>');
    expect(club.querySelector('i')).toBeNull();
    expect(club.getAttribute('href')).toBe('/c/k-1');
    expect(alice.children[5].textContent).toBe('—');
  });

  it('columns follow the mockup: # · Người chơi · Khu vực · Rating · 7 ngày · CLB · Ván (Ván dropped on mobile)', async () => {
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(PAGE)));
    const th = [...document.querySelectorAll('thead th')];
    expect(th.map((x) => x.getAttribute('data-i18n') || x.textContent)).toEqual(['#', 'rankings.col_player', 'rankings.col_region', 'rankings.col_rating', 'rankings.col_delta', 'rankings.col_club', 'rankings.col_games']);
    const [bob] = document.querySelectorAll('#rk-body tr');
    expect(bob.children).toHaveLength(7);
    expect(bob.children[3].classList.contains('num')).toBe(true); // rating
    expect(bob.children[6].classList.contains('ptbl__games')).toBe(true);
    expect(th[6].classList.contains('ptbl__games')).toBe(true);
  });

  it('phone keeps # · Người chơi · Rating: region/7-day/club/games columns carry hide classes (#330)', async () => {
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(PAGE)));
    const [bob, alice] = document.querySelectorAll('#rk-body tr');
    for (const [i, c] of [[2, 'ptbl__region'], [4, 'ptbl__delta'], [5, 'ptbl__club'], [6, 'ptbl__games']]) {
      expect(bob.children[i].classList.contains(c)).toBe(true);
      expect(document.querySelectorAll('thead th')[i].classList.contains(c)).toBe(true);
    }
    expect(alice.children[3].classList.contains('num')).toBe(true);
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'platform.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 640px\) \{\s*#rk-wrap \.ptbl__region, #rk-wrap \.ptbl__delta, #rk-wrap \.ptbl__club, #rk-wrap \.ptbl__games \{ display: none; \}/);
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

  it('switching category keeps the page path under <base href="/"> (#281)', async () => {
    const base = document.createElement('base'); base.href = '/'; document.head.appendChild(base);
    window.history.replaceState(null, '', '/rankings');
    try {
      await boot((url) => (url.includes('/me') ? ok(ME) : ok(PAGE)));
      expect(window.location.pathname).toBe('/rankings');
      [...document.querySelectorAll('.pchip')].find((c) => c.textContent === 'rankings.cat_caro').click(); await flush(); await flush();
      expect([window.location.pathname, window.location.search]).toEqual(['/rankings', '?category=caro']);
    } finally { base.remove(); window.history.replaceState(null, '', '/rankings.html'); }
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

  it('"CLB của tôi" tab appears only for members who belong to a club, and re-queries with scope=club', async () => {
    const route = (clubs) => (url) => (url.includes('/me') ? ok(ME) : url.includes('/api/clubs/mine') ? ok({ clubs }) : ok(PAGE));
    const labels = () => [...document.querySelectorAll('#rk-scope .ptab')].map((c) => c.textContent);
    await boot(route([]));
    expect(labels()).not.toContain('rankings.scope_club');
    await boot(route([{ slug: 'k1', name: 'K1' }]));
    expect(labels()).toEqual(['rankings.scope_all', 'rankings.scope_vn', 'rankings.scope_friends', 'rankings.scope_club']);
    document.querySelectorAll('#rk-scope .ptab')[3].click();
    await flush();
    expect(global.fetch.mock.calls.pop()[0]).toContain('scope=club');
    expect(location.search).toContain('scope=club');
    // guests never ask for clubs
    await boot((url) => (url.includes('/me') ? ok({ ...ME, userId: null }) : ok(PAGE)));
    expect(global.fetch.mock.calls.some((c) => String(c[0]).includes('/api/clubs/mine'))).toBe(false);
  });

  it('a stale ?scope=club link without a club falls back to everyone', async () => {
    window.history.replaceState(null, '', '/rankings.html?scope=club');
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(PAGE)));
    expect(global.fetch.mock.calls.pop()[0]).not.toContain('scope=');
    window.history.replaceState(null, '', '/rankings.html');
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
    const cells = [...document.querySelectorAll('#rk-body .ptbl__region')].map((c) => c.textContent);
    expect(cells[0].startsWith('<i>HN</i>, ')).toBe(true);
    expect(cells[1]).toBe('—');
    expect(document.querySelector('#rk-body .ptbl__region i')).toBeNull();
  });

  it('shows the empty state', async () => {
    await boot((url) => (url.includes('/me') ? Promise.resolve({ ok: false }) : ok({ ...PAGE, players: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })));
    expect(document.getElementById('rk-empty').hidden).toBe(false);
    expect(document.getElementById('rk-wrap').hidden).toBe(true); // mockup draws no empty table card
  });

  it('the table card shows again once there are rows', async () => {
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(PAGE)));
    expect(document.getElementById('rk-wrap').hidden).toBe(false);
  });

  // ── #374 RK17 ──────────────────────────────────────────────
  const P = (rank, extra) => ({ rank, userId: 'id' + rank, username: 'p' + rank, displayName: 'P' + rank, rating: 2000 - rank * 10, games: 30, provisional: false, delta7: 0, club: null, ...extra });
  const TOP5 = { ...PAGE, players: [P(1, { displayName: '<b>One</b>', delta7: 9 }), P(2, { userId: 'u1', delta7: -30 }), P(3, { provisional: true }), P(4, { delta7: 41 }), P(5)], pagination: { page: 1, limit: 50, total: 5, totalPages: 1 } };

  it('ranks 1–3 stand on the podium (DOM order 1·2·3, text only), the table holds rank ≥ 4', async () => {
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(TOP5)));
    const items = [...document.querySelectorAll('#rk-pod > li')];
    expect(document.getElementById('rk-pod').hidden).toBe(false);
    expect(items.map((li) => li.className)).toEqual(['rk-c rk-c--1', 'rk-c rk-c--2 is-me', 'rk-c rk-c--3']);
    expect(items[0].querySelector('.rk-c__nm').textContent).toBe('<b>One</b>');
    expect(items[0].querySelector('b')).toBeNull();
    expect(items[0].querySelector('.rk-c__nm').getAttribute('href')).toBe('/u/p1');
    expect(items[0].querySelector('.rk-crown')).not.toBeNull();
    expect(items[1].querySelector('.rk-crown')).toBeNull();
    expect(items[1].querySelector('.rk-d').textContent).toBe('-30');
    expect(items[1].querySelector('.rk-d').classList.contains('dn')).toBe(true);
    expect(items[2].querySelector('.ptbl__prov')).not.toBeNull();
    expect(items[2].querySelector('.rk-step').textContent).toBe('3');
    expect([...document.querySelectorAll('#rk-body tr')].map((tr) => tr.children[0].textContent)).toEqual(['4', '5']);
    expect(document.getElementById('rk-arena').hidden).toBe(false);
  });

  it('a search shows no podium: every match stays in the table with its true rank', async () => {
    window.history.replaceState(null, '', '/rankings.html?q=p');
    try {
      await boot((url) => (url.includes('/me') ? ok(ME) : ok(TOP5)));
      expect(document.getElementById('rk-pod').hidden).toBe(true);
      expect(document.querySelectorAll('#rk-pod > li')).toHaveLength(0);
      expect([...document.querySelectorAll('#rk-body tr')].map((tr) => tr.children[0].textContent)).toEqual(['1', '2', '3', '4', '5']);
    } finally { window.history.replaceState(null, '', '/rankings.html'); }
  });

  it('only 1–3 ranked players: podium shows, the empty table card hides', async () => {
    await boot((url) => (url.includes('/me') ? ok(ME) : ok({ ...TOP5, players: TOP5.players.slice(0, 2) })));
    expect(document.querySelectorAll('#rk-pod > li')).toHaveLength(2);
    expect(document.getElementById('rk-wrap').hidden).toBe(true);
    expect(document.getElementById('rk-arena').hidden).toBe(false);
  });

  it('ratings render as aria-hidden split-flap digits plus the plain number for assistive tech', async () => {
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(PAGE)));
    const cell = document.querySelector('#rk-body tr').children[3];
    expect(cell.querySelector('.rk-sr').textContent).toBe('1800');
    const flap = cell.querySelector('.rk-flap');
    expect(flap.getAttribute('aria-hidden')).toBe('true');
    expect([...flap.querySelectorAll('.rk-dg')].map((d) => d.textContent)).toEqual(['1', '8', '0', '0']);
  });

  it('ticker lists the biggest 7-day movers first (doubled for the loop); hidden when nobody moved', async () => {
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(TOP5)));
    const tick = document.getElementById('rk-tick');
    expect(tick.hidden).toBe(false);
    const spans = [...tick.querySelectorAll('span')];
    expect(spans).toHaveLength(6);
    expect(spans.slice(0, 3).map((x) => x.textContent)).toEqual(['rankings.tick_up · P4 +41', 'rankings.tick_down · P2 -30', 'rankings.tick_up · <B>ONE</B> +9']);
    expect(tick.querySelector('b')).toBeNull();
    expect(spans[1].className).toBe('dn');
    await boot((url) => (url.includes('/me') ? ok(ME) : ok({ ...TOP5, players: TOP5.players.map((p) => ({ ...p, delta7: 0 })) })));
    expect(document.getElementById('rk-tick').hidden).toBe(true);
  });

  it('the dock shows the not-ranked line for players below the game minimum', async () => {
    const me = { ...ME, ratings: { freestyle: { rank: null, rating: 1500, games: 4, total: 2 } } };
    await boot((url) => (url.includes('/me') ? ok(me) : ok(PAGE)));
    expect(document.getElementById('rk-mine').textContent).toBe('rankings.not_ranked{"games":4,"min":20}');
  });

  it('the dock reads as one spaced line for assistive tech and copy-paste', async () => {
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(PAGE)));
    expect(document.getElementById('rk-mine').textContent).toBe('rankings.you #2 / 2 · 1700');
  });

  it('a full 50-row page caps the row stagger at 17 so the cascade stays inside the opening', async () => {
    const many = { ...TOP5, players: Array.from({ length: 50 }, (_, n) => P(n + 1)) };
    await boot((url) => (url.includes('/me') ? ok(ME) : ok(many)));
    const rows = [...document.querySelectorAll('#rk-body tr')];
    expect(rows).toHaveLength(47);
    expect(rows.map((r) => +r.style.getPropertyValue('--i')).slice(15, 20)).toEqual([15, 16, 17, 17, 17]);
    const lastAt = Math.max(...[...document.querySelectorAll('#rk-body .rk-dg')].map((d) => +d.dataset.at));
    expect(lastAt).toBeLessThan(5000);
  });

  it('the LED board follows Light/Dark: light mode redefines the board tokens (user 2026-11-14)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'rankings.css'), 'utf8');
    const light = css.match(/:root\[data-mode="light"\] \.rk-page \{([^}]*)\}/);
    expect(light).not.toBeNull();
    for (const v of ['--led-bg', '--led-panel', '--led-ink', '--led-ink-2', '--led-on', '--led-dn', '--flap-top', '--flap-bot', '--flap-ink']) expect(light[1]).toContain(v + ':');
  });

  describe('5 s opening', () => {
    const media = (reduce) => { window.matchMedia = (q) => ({ matches: reduce && q.includes('reduce'), media: q }); };
    beforeEach(() => { sessionStorage.clear(); });
    afterEach(() => { delete window.matchMedia; });
    const route = (url) => (url.includes('/me') ? ok(ME) : ok(TOP5));

    it('plays on the first visit of the session; any pointer press jumps to the final state', async () => {
      media(false);
      await boot(route);
      const html = document.documentElement;
      expect(html.classList.contains('rk-intro')).toBe(true);
      expect(document.getElementById('rk-skip').hidden).toBe(false);
      window.dispatchEvent(new Event('pointerdown'));
      expect(html.classList.contains('rk-intro')).toBe(false);
      expect(document.getElementById('rk-skip').hidden).toBe(true);
      expect([...document.querySelectorAll('#rk-pod .rk-c--1 .rk-dg')].map((d) => d.textContent).join('')).toBe('1990');
      expect([...document.querySelectorAll('#rk-body tr')][0].children[3].querySelector('.rk-flap').textContent).toBe('1960');
    });

    it('the Bỏ qua button skips; the opening ends by itself after 5 s', async () => {
      media(false);
      await boot(route);
      document.getElementById('rk-skip').click();
      expect(document.documentElement.classList.contains('rk-intro')).toBe(false);
      sessionStorage.clear();
      jest.useFakeTimers();
      fakeTimers = true;
      try {
        await boot(route);
        expect(document.documentElement.classList.contains('rk-intro')).toBe(true);
        jest.advanceTimersByTime(4990); // boot's flushes already advanced a few ms
        expect(document.documentElement.classList.contains('rk-intro')).toBe(true);
        jest.advanceTimersByTime(20);
        expect(document.documentElement.classList.contains('rk-intro')).toBe(false);
      } finally { fakeTimers = false; jest.useRealTimers(); }
    });

    it('does not replay in the same session, nor on a later tab switch', async () => {
      media(false);
      await boot(route);
      document.getElementById('rk-skip').click();
      [...document.querySelectorAll('.pchip')].find((c) => c.textContent === 'rankings.cat_caro').click();
      await flush(); await flush();
      expect(document.documentElement.classList.contains('rk-intro')).toBe(false);
      await boot(route);
      expect(document.documentElement.classList.contains('rk-intro')).toBe(false);
    });

    it('never plays under prefers-reduced-motion, without matchMedia, or for an empty board', async () => {
      media(true);
      await boot(route);
      expect(document.documentElement.classList.contains('rk-intro')).toBe(false);
      delete window.matchMedia;
      sessionStorage.clear();
      await boot(route);
      expect(document.documentElement.classList.contains('rk-intro')).toBe(false);
      media(false);
      sessionStorage.clear();
      await boot((url) => (url.includes('/me') ? ok(ME) : ok({ ...PAGE, players: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } })));
      expect(document.documentElement.classList.contains('rk-intro')).toBe(false);
      expect(document.getElementById('rk-arena').hidden).toBe(true);
    });
  });
});
