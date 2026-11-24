/**
 * club-kit.js — shared parts of the "Hội quán" club shell (#446), used by club.js and clubs.js:
 * the my-clubs rail and the generated stone-pattern banner for clubs without one.
 * User-supplied text only via textContent / attributes.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const SVG = 'http://www.w3.org/2000/svg';
  const COLORS = ['blue', 'green', 'red', 'orange', 'purple', 'teal', 'pink', 'gray'];
  const colorKey = (c) => (COLORS.includes(c) ? c : 'blue');

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function svg(tag, attrs) {
    const n = document.createElementNS(SVG, tag);
    for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
    return n;
  }

  function icon(name) {
    return window.PlatformShell.icon('ph-regular-' + name);
  }

  /** Seeded PRNG (mulberry32) so a club's banner is the same on every visit. */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let x = a;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** A few stones on a board grid over the club colour: no club looks empty without a banner. */
  function genBanner(slug, color) {
    const g = rng([...String(slug)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 3));
    const root = svg('svg', { class: 'cl-genb', viewBox: '0 0 400 100', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true', focusable: 'false' });
    root.style.setProperty('--cc', 'var(--club-' + colorKey(color) + ')');
    root.appendChild(svg('rect', { width: '400', height: '100', class: 'cl-genb__bg' }));
    let d = '';
    for (let i = 0; i < 40; i++) d += 'M' + (i * 10 + 5) + ' 0V100';
    for (let i = 0; i < 10; i++) d += 'M0 ' + (i * 10 + 5) + 'H400';
    root.appendChild(svg('path', { d, class: 'cl-genb__ln' }));
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(g() * 40), y = Math.floor(g() * 10);
      root.appendChild(svg('circle', { cx: String(x * 10 + 5), cy: String(y * 10 + 5), r: '3.8', class: g() < 0.5 ? 'cl-genb__b' : 'cl-genb__w' }));
    }
    return root;
  }

  function hasSession() {
    try { return !!localStorage.getItem('gvn_user'); } catch (_) { return true; } // unreadable storage: let the API decide
  }

  /** GET /api/clubs/mine → array, or null when signed out / failed (no request without a session, #319). */
  async function fetchMine() {
    if (!hasSession()) return null;
    try {
      const res = await fetch('/api/clubs/mine', { credentials: 'same-origin' });
      if (!res.ok) return null;
      const body = await res.json();
      return Array.isArray(body && body.clubs) ? body.clubs : [];
    } catch (_) { return null; }
  }

  function crest(c, cls) {
    return window.PlatformShell.avatar(c.avatarUrl || null, c.name, 'pav cl-crest' + (cls ? ' ' + cls : ''), { color: c.color, tag: c.tag });
  }

  /**
   * Fill the rail: my clubs (crests), the viewed club when I'm not in it, then Khám phá and Tạo nhóm.
   * @param {HTMLElement} host  the <nav class="cl-rail">
   * @param {{mine: Array|null, active: string|null, current?: object}} o  active = slug or 'discover'
   */
  function renderRail(host, { mine, active, current }) {
    const items = [];
    const list = (mine || []).map((c) => (current && c.slug === current.slug ? { ...c, color: current.color, tag: current.tag, avatarUrl: current.avatarUrl } : c));
    if (current && !list.some((c) => c.slug === current.slug)) list.push(current);
    for (const c of list) {
      const a = el('a', undefined, 'cl-rail__club');
      a.href = '/c/' + encodeURIComponent(c.slug);
      a.title = c.name;
      a.setAttribute('aria-label', c.name);
      if (c.slug === active) { a.classList.add('is-on'); a.setAttribute('aria-current', 'page'); }
      a.appendChild(crest(c));
      items.push(a);
    }
    if (items.length) items.push(el('hr', undefined, 'cl-rail__sep'));
    const btn = (href, iconName, key, on) => {
      const a = el('a', undefined, 'cl-rail__btn' + (on ? ' is-on' : ''));
      a.href = href;
      a.title = t(key);
      a.setAttribute('aria-label', t(key));
      if (on) a.setAttribute('aria-current', 'page');
      a.appendChild(icon(iconName));
      return a;
    };
    items.push(btn('/clubs.html', 'magnifying-glass', 'clubs.discover', active === 'discover'));
    if (mine) {
      const create = btn('/clubs.html#create', 'plus-circle', 'clubs.create', false);
      create.id = 'cl-rail-create';
      items.push(create);
    }
    host.replaceChildren(...items);
    return host;
  }

  window.ClubKit = { el, icon, genBanner, fetchMine, hasSession, renderRail, crest, colorKey };
})();
