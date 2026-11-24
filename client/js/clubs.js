/**
 * clubs.js — discover / create clubs (#178), "Hội quán" shell (#446): my-clubs rail with Khám phá
 * active, then title, search, filter chips, featured banner cards and one-line club rows. API: /api/clubs.
 * User-supplied text only via textContent.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const state = { page: 1, q: '', tab: 'discover', mine: null, data: null };
  const FEATURED = 3;

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function errMsg(body) {
    const k = 'clubs.err_' + (body && body.code);
    const v = t(k);
    return v && v !== k ? v : (body && body.error) || t('clubs.error');
  }

  const mineSlugs = () => new Set((state.mine || []).map((c) => c.slug));

  function row(c, joined) {
    const a = el('a', undefined, 'prow');
    a.href = '/c/' + encodeURIComponent(c.slug);
    a.style.setProperty('--cc', 'var(--club-' + window.ClubKit.colorKey(c.color) + ')');
    const body = el('div', undefined, 'prow__body');
    body.append(el('div', c.name, 'prow__t'));
    body.append(window.PlatformShell.meta([t('clubs.members', { n: c.members }), c.avgRating ? t('clubs.avg', { n: c.avgRating }) : '']));
    if (c.description) body.append(el('div', c.description, 'prow__m prow__desc')); // #321: own line, CSS-clamped
    const side = el('span', undefined, 'cl-side');
    if (c.rank) side.append(el('span', t('clubs.rank_badge', { n: c.rank }), 'pbadge'));
    if (c.joinPolicy !== 'open') side.append(el('span', t('clubs.policy_invite_short'), 'pbadge')); // open is the default: no badge (#322)
    // The whole row is the link: the "action" is a label, not a nested button.
    side.append(joined ? el('span', t('clubs.joined'), 'cl-pill') : el('span', t(c.joinPolicy === 'open' ? 'clubs.visit' : 'clubs.ask'), 'cl-act'));
    a.append(window.ClubKit.crest(c), body, side);
    return a;
  }

  /** Featured: the biggest clubs (the list is ordered by members) on the unfiltered first page. */
  function renderFeatured(clubs) {
    const box = $('cl-feat');
    const show = state.tab === 'discover' && state.page === 1 && !state.q && clubs.length >= FEATURED;
    box.hidden = !show;
    box.replaceChildren(...(show ? clubs.slice(0, FEATURED).map((c, i) => {
      const a = el('a', undefined, 'cl-fc');
      a.href = '/c/' + encodeURIComponent(c.slug);
      a.setAttribute('role', 'listitem');
      a.style.setProperty('--cc', 'var(--club-' + window.ClubKit.colorKey(c.color) + ')');
      a.style.setProperty('--i', String(i));
      const inner = el('div', undefined, 'cl-fc__in');
      const name = el('h3', undefined, 'cl-fc__name');
      name.append(window.ClubKit.crest(c), el('span', c.name, 'cl-nm'));
      inner.append(name, el('span', t('clubs.members', { n: c.members }), 'cl-fc__meta'));
      a.append(window.ClubKit.genBanner(c.slug, c.color), inner);
      return a;
    }) : []));
  }

  function renderList() {
    const data = state.data;
    if (!data) return;
    const joined = mineSlugs();
    $('cl-list').replaceChildren(...data.clubs.map((c) => row(c, joined.has(c.slug))));
    renderFeatured(data.clubs);
  }

  async function loadList() {
    let data;
    try {
      const res = await fetch('/api/clubs?page=' + state.page + '&q=' + encodeURIComponent(state.q));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      data = await res.json();
    } catch (_) { // #320: never leave a stale list under a new query
      state.data = null;
      $('cl-status').textContent = t('clubs.error');
      $('cl-list').replaceChildren();
      $('cl-feat').replaceChildren();
      $('cl-feat').hidden = true;
      $('cl-pager').replaceChildren();
      return;
    }
    state.data = data;
    $('cl-status').textContent = data.clubs.length ? '' : t('clubs.empty');
    renderList();

    const pager = $('cl-pager');
    pager.replaceChildren();
    const pg = data.pagination;
    if (pg.totalPages > 1) {
      const prev = el('button', t('rankings.prev'), 'pbtn');
      const next = el('button', t('rankings.next'), 'pbtn');
      prev.type = next.type = 'button';
      prev.disabled = pg.page <= 1;
      next.disabled = pg.page >= pg.totalPages;
      prev.onclick = () => { state.page--; loadList(); };
      next.onclick = () => { state.page++; loadList(); };
      pager.append(prev, el('span', pg.page + ' / ' + pg.totalPages), next);
    }
  }

  function showTab(tab) {
    state.tab = tab;
    $('cl-tabs').querySelectorAll('.ptab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $('cl-list').hidden = $('cl-pager').hidden = tab !== 'discover';
    $('cl-mine').hidden = tab !== 'mine';
    $('cl-q').closest('.psearch').hidden = tab !== 'discover';
    if (state.data) renderFeatured(state.data.clubs); else $('cl-feat').hidden = true;
  }

  function renderTabs(loggedIn) {
    const tabs = [['discover', t('clubs.tab_discover')]];
    if (loggedIn) tabs.push(['mine', t('clubs.mine')]);
    $('cl-tabs').replaceChildren(...tabs.map(([id, label]) => {
      const b = el('button', label, 'ptab');
      b.type = 'button';
      b.dataset.tab = id;
      b.setAttribute('role', 'tab');
      b.onclick = () => showTab(id);
      return b;
    }));
    showTab('discover');
  }

  function renderRail() {
    window.ClubKit.renderRail($('cb-rail'), { mine: state.mine, active: 'discover' });
  }

  function setCreateOpen(open) {
    if ($('cl-create-toggle').hidden) open = false; // signed out: no create form
    $('cl-create-panel').hidden = !open;
    $('cl-create-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('cl-name').focus();
  }

  async function loadMine() {
    const clubs = await window.ClubKit.fetchMine(); // #319: no request without a session; null when signed out
    state.mine = clubs;
    renderRail();
    if (!clubs) { renderTabs(false); return; } // logged out: discover only
    renderTabs(true);
    $('cl-create-toggle').hidden = false;
    $('cl-mine').replaceChildren(...(clubs.length ? clubs.map((c) => {
      const a = el('a', undefined, 'prow');
      a.href = '/c/' + encodeURIComponent(c.slug);
      const body = el('div', undefined, 'prow__body');
      body.append(el('div', c.name, 'prow__t'), el('div', t('clubs.members', { n: c.members }), 'prow__m'));
      const side = el('span', undefined, 'cl-side');
      side.append(el('span', t('clubs.role_' + c.role), 'cl-pill'));
      a.append(window.ClubKit.crest(c), body, side);
      return a;
    }) : [el('p', t('clubs.no_mine'), 'pnote')]));
    renderList();
    if (location.hash === '#create') setCreateOpen(true);
  }

  async function create(ev) {
    ev.preventDefault();
    clearFormError();
    const res = await fetch('/api/clubs', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('cl-name').value, description: $('cl-desc').value, joinPolicy: $('cl-policy').value }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) { location.href = '/c/' + encodeURIComponent(body.slug); return; }
    showFormError(errMsg(body));
  }

  // #323: field-adjacent error — message red + icon, #cl-name marked invalid and focused.
  function showFormError(text) {
    const msg = $('cl-form-msg'), name = $('cl-name');
    msg.replaceChildren(window.PlatformShell.icon('ph-regular-warning'), document.createTextNode(text));
    name.setAttribute('aria-invalid', 'true');
    name.setAttribute('aria-describedby', 'cl-form-msg');
    name.focus();
  }

  function clearFormError() {
    $('cl-form-msg').replaceChildren();
    $('cl-name').removeAttribute('aria-invalid');
    $('cl-name').removeAttribute('aria-describedby');
  }

  document.addEventListener('DOMContentLoaded', () => {
    let timer;
    $('cl-q').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; loadList(); }, 250);
    });
    window.PlatformShell.build('clubs');
    renderRail();
    $('cl-create-toggle').addEventListener('click', () => setCreateOpen($('cl-create-panel').hidden));
    window.addEventListener('hashchange', () => { if (location.hash === '#create') setCreateOpen(true); });
    $('cl-form').addEventListener('submit', create);
    $('cl-name').addEventListener('input', clearFormError);
    renderTabs(false);
    loadMine();
    loadList();
  });
})();
