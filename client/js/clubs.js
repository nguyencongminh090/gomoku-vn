/**
 * clubs.js — discover / create clubs (#178). API: /api/clubs.
 * User-supplied text only via textContent.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const state = { page: 1, q: '', tab: 'discover' };

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

  function row(c) {
    const a = el('a', undefined, 'prow');
    a.href = '/c/' + encodeURIComponent(c.slug);
    const body = el('div', undefined, 'prow__body');
    body.append(el('div', c.name, 'prow__t'));
    const meta = t('clubs.members', { n: c.members }) + (c.avgRating ? ' · ' + t('clubs.avg', { n: c.avgRating }) : '') +
      (c.description ? ' · ' + c.description : '');
    body.append(el('div', meta, 'prow__m'));
    a.append(window.PlatformShell.avatar(null, c.name, 'pav--sm pav--sq'), body);
    if (c.rank) a.append(el('span', t('clubs.rank_badge', { n: c.rank }), 'pbadge'));
    a.append(el('span', t(c.joinPolicy === 'open' ? 'clubs.policy_open_short' : 'clubs.policy_invite_short'), 'pbadge'));
    return a;
  }

  async function loadList() {
    const res = await fetch('/api/clubs?page=' + state.page + '&q=' + encodeURIComponent(state.q));
    if (!res.ok) { $('cl-status').textContent = t('clubs.error'); return; }
    const data = await res.json();
    $('cl-status').textContent = data.clubs.length ? '' : t('clubs.empty');
    const list = $('cl-list');
    list.replaceChildren(...data.clubs.map(row));

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
  }

  function renderTabs(loggedIn) {
    const tabs = [['discover', t('clubs.tab_discover')]];
    if (loggedIn) tabs.push(['mine', t('clubs.tab_mine')]);
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

  async function loadMine() {
    const res = await fetch('/api/clubs/mine', { credentials: 'same-origin' });
    if (!res.ok) { renderTabs(false); return; } // logged out: discover only
    const { clubs } = await res.json();
    renderTabs(true);
    $('cl-create-toggle').hidden = false;
    $('cl-mine').replaceChildren(...(clubs.length ? clubs.map((c) => {
      const a = el('a', undefined, 'prow');
      a.href = '/c/' + encodeURIComponent(c.slug);
      const body = el('div', undefined, 'prow__body');
      body.append(el('div', c.name, 'prow__t'), el('div', t('clubs.members', { n: c.members }), 'prow__m'));
      a.append(window.PlatformShell.avatar(null, c.name, 'pav--sm pav--sq'), body, el('span', t('clubs.role_' + c.role), 'pbadge'));
      return a;
    }) : [el('p', t('clubs.no_mine'), 'pnote')]));
  }

  async function create(ev) {
    ev.preventDefault();
    const res = await fetch('/api/clubs', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('cl-name').value, description: $('cl-desc').value, joinPolicy: $('cl-policy').value }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok) { location.href = '/c/' + encodeURIComponent(body.slug); return; }
    $('cl-form-msg').textContent = errMsg(body);
  }

  document.addEventListener('DOMContentLoaded', () => {
    let timer;
    $('cl-q').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = e.target.value.trim(); state.page = 1; loadList(); }, 250);
    });
    window.PlatformShell.build('clubs');
    $('cl-create-toggle').addEventListener('click', () => { $('cl-create-panel').hidden = !$('cl-create-panel').hidden; });
    $('cl-form').addEventListener('submit', create);
    renderTabs(false);
    loadMine();
    loadList();
  });
})();
