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
    q: (params.get('q') || '').slice(0, 30),
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
      const b = el('button', t('rankings.cat_' + c), 'pchip');
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
      const name = document.createElement('td');
      const link = el('a', p.displayName);
      link.href = '/u/' + encodeURIComponent(p.username);
      name.append(window.PlatformShell.avatar(p.avatarUrl, p.displayName, 'pav--sm'), link);
      const rating = el('td', String(p.rating), 'num');
      if (p.provisional) rating.appendChild(el('span', '?', 'ptbl__prov'));
      const delta = el('td', p.delta7 > 0 ? '+' + p.delta7 : String(p.delta7), 'num' + (p.delta7 > 0 ? ' up' : p.delta7 < 0 ? ' dn' : ''));
      const club = document.createElement('td');
      if (p.club) {
        const ca = el('a', p.club.name);
        ca.href = '/c/' + encodeURIComponent(p.club.slug);
        club.appendChild(ca);
      } else {
        club.textContent = '—';
      }
      tr.append(el('td', String(p.rank)), name, rating, delta, club, el('td', String(p.games), 'num'));
      bodyEl.appendChild(tr);
    }
    emptyEl.hidden = data.players.length > 0;
    emptyEl.textContent = state.q ? t('rankings.no_match', { q: state.q }) : t('rankings.empty', { min: data.minGames });
    totalEl.textContent = t('rankings.total', { n: data.pagination.total });
    footEl.textContent = t('rankings.footnote', { min: data.minGames });
  }

  function renderPager(pg) {
    pagerEl.replaceChildren();
    if (pg.totalPages <= 1) return;
    const prev = el('button', t('rankings.prev'), 'pbtn');
    const next = el('button', t('rankings.next'), 'pbtn');
    prev.type = next.type = 'button';
    prev.disabled = pg.page <= 1;
    next.disabled = pg.page >= pg.totalPages;
    prev.addEventListener('click', () => { state.page = pg.page - 1; load(); });
    next.addEventListener('click', () => { state.page = pg.page + 1; load(); });
    pagerEl.append(prev, el('span', pg.page + ' / ' + pg.totalPages), next);
  }

  async function load() {
    renderTabs();
    history.replaceState(null, '', '?category=' + state.category + (state.page > 1 ? '&page=' + state.page : '') + (state.q ? '&q=' + encodeURIComponent(state.q) : ''));
    try {
      const res = await fetch('/api/rankings?category=' + state.category + '&page=' + state.page + (state.q ? '&q=' + encodeURIComponent(state.q) : ''));
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
    window.PlatformShell.build('rankings');
    const qEl = document.getElementById('rk-q');
    qEl.value = state.q;
    let timer;
    qEl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = qEl.value.trim().slice(0, 30); state.page = 1; load(); }, 250);
    });
    try {
      const res = await fetch('/api/rankings/me', { credentials: 'same-origin' });
      if (res.ok) state.mine = await res.json();
    } catch (_) { /* logged out / offline: no personal line */ }
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
