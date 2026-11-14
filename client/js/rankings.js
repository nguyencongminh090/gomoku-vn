/**
 * rankings.js — leaderboard page (#176).
 *
 * GET /api/rankings?category=&page= for the table, GET /api/rankings/me (401
 * when logged out → silently skipped) for "your rank" + row highlight. All user-supplied text
 * goes through textContent.
 *
 * #374 RK17: rank 1–3 stand on a podium (no search), the table holds the rest inside an LED board,
 * ratings show as split-flap digits (aria-hidden; the number itself is in .rk-sr), a LÊN/XUỐNG ticker,
 * a fixed "your rank" dock, and a 5 s opening on the first render — once per session, skipped on any
 * input, never under prefers-reduced-motion. The DOM holds the final values from t=0.
 */

'use strict';

(function () {
  const CATEGORIES = ['freestyle', 'standard', 'caro'];
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);

  const tabsEl = document.getElementById('rk-tabs');     // rule chips (filter)
  const scopeEl = document.getElementById('rk-scope');   // scope = underline tabs
  const bodyEl = document.getElementById('rk-body');
  const totalEl = document.getElementById('rk-total');
  const emptyEl = document.getElementById('rk-empty');
  const mineEl = document.getElementById('rk-mine');
  const footEl = document.getElementById('rk-footnote');
  const pagerEl = document.getElementById('rk-pager');
  const podEl = document.getElementById('rk-pod');
  const arenaEl = document.getElementById('rk-arena');
  const tickEl = document.getElementById('rk-tick');
  const skipEl = document.getElementById('rk-skip');
  const INTRO_MS = 5000;
  const INTRO_KEY = 'rk-intro';

  const params = new URLSearchParams(location.search);
  const state = {
    category: CATEGORIES.includes(params.get('category')) ? params.get('category') : CATEGORIES[0],
    page: Math.max(1, parseInt(params.get('page'), 10) || 1),
    q: (params.get('q') || '').slice(0, 30),
    scope: ['friends', 'vn', 'club'].includes(params.get('scope')) ? params.get('scope') : 'all',
    mine: null,
    hasClub: false, // belongs to ≥ 1 club → "CLB của tôi" tab
  };

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function renderTabs() {
    tabsEl.replaceChildren();
    scopeEl.replaceChildren();
    {
      for (const sc of state.mine && state.mine.userId ? ['all', 'vn', 'friends', ...(state.hasClub ? ['club'] : [])] : ['all', 'vn']) {
        const b = el('button', t('rankings.scope_' + sc), 'ptab');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(sc === state.scope));
        b.addEventListener('click', () => {
          if (sc === state.scope) return;
          state.scope = sc;
          state.page = 1;
          load();
        });
        scopeEl.appendChild(b);
      }
    }
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
    const box = el('div', undefined, 'rk-dock__in');
    if (m.rank) {
      box.append(el('span', t('rankings.you')), ' ', el('b', '#' + m.rank), ' ', el('span', '/ ' + m.total + ' · ' + m.rating, 'rk-dock__m'));
    } else {
      box.append(el('span', t('rankings.not_ranked', { games: m.games, min: state.mine.minGames }), 'rk-dock__m'));
    }
    mineEl.appendChild(box);
  }

  /** "Hà Nội, Việt Nam" / "Việt Nam" / "—": city is free text (textContent only), country name from Intl. */
  function regionText(p) {
    const country = p.country && window.Countries ? window.Countries.name(p.country, document.documentElement.lang || 'vi') : '';
    return [p.city, country].filter(Boolean).join(', ') || '—';
  }

  /** Split-flap digits (visual only) + the real number for assistive tech. `at` = ms into the intro when they settle. */
  function flap(value, at) {
    const frag = document.createDocumentFragment();
    frag.appendChild(el('span', String(value), 'rk-sr'));
    const box = el('span', undefined, 'rk-flap');
    box.setAttribute('aria-hidden', 'true');
    String(value).split('').forEach((c, j) => {
      const d = el('i', c, 'rk-dg');
      d.dataset.v = c;
      d.dataset.at = String(at + j * 90);
      box.appendChild(d);
    });
    frag.appendChild(box);
    return frag;
  }

  function deltaText(d) { return d > 0 ? '+' + d : String(d); }
  function deltaCls(d) { return d > 0 ? ' up' : d < 0 ? ' dn' : ''; }

  function renderPodium(top) {
    podEl.replaceChildren();
    podEl.hidden = top.length === 0;
    for (const p of top) {
      const li = el('li', undefined, 'rk-c rk-c--' + p.rank);
      if (state.mine && p.userId === state.mine.userId) li.classList.add('is-me');
      const who = el('div', undefined, 'rk-who');
      if (p.rank === 1) who.appendChild(el('i', undefined, 'rk-crown'));
      const link = el('a', p.displayName, 'rk-c__nm');
      link.href = '/u/' + encodeURIComponent(p.username);
      who.append(window.PlatformShell.avatar(p.avatarUrl, p.displayName), link);
      const rt = el('div', undefined, 'rk-c__rt');
      rt.appendChild(flap(p.rating, 3700 + (p.rank - 1) * 120));
      if (p.provisional) rt.appendChild(el('span', '?', 'ptbl__prov'));
      who.append(rt, el('div', deltaText(p.delta7), 'rk-d num' + deltaCls(p.delta7)));
      const step = el('div', String(p.rank), 'rk-step');
      step.setAttribute('aria-hidden', 'true');
      li.append(who, step);
      podEl.appendChild(li);
    }
  }

  /** LÊN/XUỐNG ticker from the page's biggest 7-day movers (decorative: aria-hidden). Doubled for a seamless loop. */
  function renderTicker(players) {
    const movers = players.filter((p) => p.delta7).sort((a, b) => Math.abs(b.delta7) - Math.abs(a.delta7)).slice(0, 8);
    const inner = tickEl.firstElementChild;
    inner.replaceChildren();
    tickEl.hidden = movers.length === 0;
    for (let k = 0; k < 2; k++) {
      for (const p of movers) {
        inner.appendChild(el('span', t(p.delta7 > 0 ? 'rankings.tick_up' : 'rankings.tick_down') + ' · ' + String(p.displayName).toUpperCase() + ' ' + deltaText(p.delta7), p.delta7 > 0 ? 'up' : 'dn'));
      }
    }
  }

  function renderRows(data) {
    bodyEl.replaceChildren();
    const top = state.q ? [] : data.players.filter((p) => p.rank >= 1 && p.rank <= 3);
    renderPodium(top);
    renderTicker(data.players);
    arenaEl.hidden = data.players.length === 0;
    let i = 0;
    for (const p of data.players) {
      if (top.includes(p)) continue;
      const tr = document.createElement('tr');
      const k = Math.min(i, 17); // 50 rows/page: cap the stagger so the cascade ends ≈ 2.4 s, inside the 5 s opening
      tr.style.setProperty('--i', String(k));
      if (state.mine && p.userId === state.mine.userId) tr.className = 'is-me';
      if (p.rank >= 1 && p.rank <= 3) tr.classList.add('rk-top', 'rk-top--' + p.rank);
      const name = document.createElement('td');
      const link = el('a', p.displayName);
      link.href = '/u/' + encodeURIComponent(p.username);
      name.append(window.PlatformShell.avatar(p.avatarUrl, p.displayName, 'pav--sm'), link);
      const rating = el('td', undefined, 'num');
      rating.appendChild(flap(p.rating, 700 + k * 110));
      if (p.provisional) rating.appendChild(el('span', '?', 'ptbl__prov'));
      const delta = el('td', deltaText(p.delta7), 'num ptbl__delta' + deltaCls(p.delta7));
      const club = document.createElement('td');
      club.className = 'ptbl__club';
      if (p.club) {
        const ca = el('a', p.club.name);
        ca.href = '/c/' + encodeURIComponent(p.club.slug);
        club.appendChild(ca);
      } else {
        club.textContent = '—';
      }
      // Mockup order: # · Người chơi · Khu vực · Rating · 7 ngày · CLB (+ Ván). Phone keeps # · Người chơi · Rating (#330).
      tr.append(el('td', String(p.rank)), name, el('td', regionText(p), 'ptbl__region'), rating, delta, club, el('td', String(p.games), 'num ptbl__games'));
      bodyEl.appendChild(tr);
      i++;
    }
    emptyEl.hidden = data.players.length > 0;
    document.getElementById('rk-wrap').hidden = bodyEl.children.length === 0; // ≤ 3 players: podium only
    emptyEl.textContent = state.q ? t('rankings.no_match', { q: state.q })
      : state.scope === 'friends' ? t('rankings.friends_empty', { min: data.minGames })
      : state.scope === 'club' ? t('rankings.club_empty', { min: data.minGames })
      : state.scope === 'vn' ? t('rankings.vn_empty', { min: data.minGames }) : t('rankings.empty', { min: data.minGames });
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

  // ── 5 s opening ──────────────────────────────────────────────
  const intro = { timer: 0, raf: 0, on: false };
  const SKIP_EVENTS = ['pointerdown', 'wheel', 'keydown', 'touchstart'];
  const raf = (fn) => (window.requestAnimationFrame ? window.requestAnimationFrame(fn) : setTimeout(() => fn(Date.now()), 16));
  const caf = (id) => (window.cancelAnimationFrame ? window.cancelAnimationFrame(id) : clearTimeout(id));

  function finishIntro() {
    if (!intro.on) return;
    intro.on = false;
    clearTimeout(intro.timer);
    caf(intro.raf);
    document.documentElement.classList.remove('rk-intro');
    skipEl.hidden = true;
    for (const d of document.querySelectorAll('.rk-dg')) { d.textContent = d.dataset.v; d.classList.remove('is-flip'); }
    SKIP_EVENTS.forEach((e) => window.removeEventListener(e, finishIntro, true));
  }

  function introWanted() {
    if (!window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    try {
      if (sessionStorage.getItem(INTRO_KEY) === '1') return false;
      sessionStorage.setItem(INTRO_KEY, '1');
    } catch (_) { return false; } // storage blocked → never risk replaying on every visit
    return true;
  }

  /** Digits roll through random values and settle one by one at their data-at time; CSS staggers the rest. */
  function playIntro() {
    intro.on = true;
    document.documentElement.classList.add('rk-intro');
    skipEl.hidden = false;
    const digits = [...document.querySelectorAll('.rk-dg')];
    const t0 = Date.now();
    let last = 0;
    const step = () => {
      const now = Date.now(), ms = now - t0;
      const roll = now - last > 60;
      if (roll) last = now;
      for (const d of digits) {
        if (d.dataset.done) continue;
        if (ms >= +d.dataset.at) {
          d.dataset.done = '1';
          d.textContent = d.dataset.v;
          d.classList.add('is-flip');
        } else if (roll) {
          d.textContent = String(Math.floor(Math.random() * 10));
        }
      }
      if (intro.on && ms < INTRO_MS) intro.raf = raf(step);
    };
    intro.raf = raf(step);
    intro.timer = setTimeout(finishIntro, INTRO_MS);
    SKIP_EVENTS.forEach((e) => window.addEventListener(e, finishIntro, true));
  }

  async function load() {
    finishIntro(); // a tab/page switch during the opening jumps to the end first
    renderTabs();
    history.replaceState(null, '', location.pathname + '?category=' + state.category + (state.scope !== 'all' ? '&scope=' + state.scope : '') + (state.page > 1 ? '&page=' + state.page : '') + (state.q ? '&q=' + encodeURIComponent(state.q) : ''));
    try {
      const res = await fetch('/api/rankings?category=' + state.category + (state.scope !== 'all' ? '&scope=' + state.scope : '') + '&page=' + state.page + (state.q ? '&q=' + encodeURIComponent(state.q) : ''));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderRows(data);
      renderPager(data.pagination);
      renderMine();
      if (!state.introDone) {
        state.introDone = true;
        if (data.players.length && introWanted()) playIntro();
      }
    } catch (err) {
      arenaEl.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = t('rankings.error');
    }
  }

  async function init() {
    window.PlatformShell.build('rankings');
    skipEl.addEventListener('click', finishIntro);
    const qEl = document.getElementById('rk-q');
    qEl.value = state.q;
    let timer;
    qEl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = qEl.value.trim().slice(0, 30); state.page = 1; load(); }, 250);
    });
    try {
      const res = await (window.PlatformShell && window.PlatformShell.fetchMe ? window.PlatformShell.fetchMe() : fetch('/api/rankings/me', { credentials: 'same-origin' }));
      if (res.ok) state.mine = await res.json();
    } catch (_) { /* logged out / offline: no personal line */ }
    if (state.mine && state.mine.userId) {
      try {
        const res = await fetch('/api/clubs/mine', { credentials: 'same-origin' });
        const d = res.ok ? await res.json() : null;
        state.hasClub = !!(d && d.clubs && d.clubs.length);
      } catch (_) { /* no club tab */ }
    }
    if (state.scope === 'club' && !state.hasClub) state.scope = 'all'; // stale ?scope=club link
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
