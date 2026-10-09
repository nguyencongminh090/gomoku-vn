/**
 * rankings.js — leaderboard page (#176).
 *
 * GET /api/rankings?category=&page= for the table, GET /api/rankings/me (401
 * when logged out → silently skipped) for "your rank" + row highlight. All user-supplied text
 * goes through textContent.
 */

'use strict';

(function () {
  const CATEGORIES = ['freestyle', 'standard', 'caro'];
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);

  const tabsEl = document.getElementById('rk-tabs');
  const bodyEl = document.getElementById('rk-body');
  const totalEl = document.getElementById('rk-total');
  const emptyEl = document.getElementById('rk-empty');
  const mineEl = document.getElementById('rk-mine');
  const footEl = document.getElementById('rk-footnote');
  const pagerEl = document.getElementById('rk-pager');

  const params = new URLSearchParams(location.search);
  const state = {
    category: CATEGORIES.includes(params.get('category')) ? params.get('category') : CATEGORIES[0],
    page: Math.max(1, parseInt(params.get('page'), 10) || 1),
    mine: null,
  };

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function renderTabs() {
    tabsEl.replaceChildren();
    for (const c of CATEGORIES) {
      const b = el('button', t('rankings.cat_' + c), 'rankings__tab');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(c === state.category));
      b.addEventListener('click', () => {
        if (c === state.category) return;
        state.category = c;
        state.page = 1;
        load();
      });
      tabsEl.appendChild(b);
    }
  }

  function renderMine() {
    const m = state.mine && state.mine.ratings[state.category];
    mineEl.replaceChildren();
    if (!m) return;
    if (m.rank) {
      mineEl.append(t('rankings.you'), ' ', el('b', '#' + m.rank), ' / ' + m.total + ' · ' + m.rating);
    } else {
      mineEl.textContent = t('rankings.not_ranked', { games: m.games, min: state.mine.minGames });
    }
  }

  function renderRows(data) {
    bodyEl.replaceChildren();
    for (const p of data.players) {
      const tr = document.createElement('tr');
      if (state.mine && p.userId === state.mine.userId) tr.className = 'is-me';
      const name = el('td', p.displayName);
      const rating = el('td', String(p.rating), 'num');
      if (p.provisional) rating.appendChild(el('span', '?', 'rankings__prov'));
      tr.append(el('td', String(p.rank)), name, rating, el('td', String(p.games), 'num'));
      bodyEl.appendChild(tr);
    }
    emptyEl.hidden = data.players.length > 0;
    emptyEl.textContent = t('rankings.empty', { min: data.minGames });
    totalEl.textContent = t('rankings.total', { n: data.pagination.total });
    footEl.textContent = t('rankings.footnote', { min: data.minGames });
  }

  function renderPager(pg) {
    pagerEl.replaceChildren();
    if (pg.totalPages <= 1) return;
    const prev = el('button', t('rankings.prev'));
    const next = el('button', t('rankings.next'));
    prev.type = next.type = 'button';
    prev.disabled = pg.page <= 1;
    next.disabled = pg.page >= pg.totalPages;
    prev.addEventListener('click', () => { state.page = pg.page - 1; load(); });
    next.addEventListener('click', () => { state.page = pg.page + 1; load(); });
    pagerEl.append(prev, el('span', pg.page + ' / ' + pg.totalPages), next);
  }

  async function load() {
    renderTabs();
    history.replaceState(null, '', '?category=' + state.category + (state.page > 1 ? '&page=' + state.page : ''));
    try {
      const res = await fetch('/api/rankings?category=' + state.category + '&page=' + state.page);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderRows(data);
      renderPager(data.pagination);
      renderMine();
    } catch (err) {
      emptyEl.hidden = false;
      emptyEl.textContent = t('rankings.error');
    }
  }

  async function init() {
    try {
      const res = await fetch('/api/rankings/me', { credentials: 'same-origin' });
      if (res.ok) state.mine = await res.json();
    } catch (_) { /* logged out / offline: no personal line */ }
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
