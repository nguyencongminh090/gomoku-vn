/**
 * clubs.js — discover / create clubs (#178). API: /api/clubs.
 * User-supplied text only via textContent.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const state = { page: 1, q: '' };

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
    const li = document.createElement('li');
    const main = el('div', undefined, 'clubs__row-main');
    const a = el('a', c.name);
    a.href = '/c/' + encodeURIComponent(c.slug);
    main.append(a);
    const meta = t('clubs.members', { n: c.members }) + (c.avgRating ? ' · ' + t('clubs.avg', { n: c.avgRating }) : '');
    main.append(el('small', meta));
    if (c.description) main.append(el('small', c.description));
    li.append(main, el('span', t(c.joinPolicy === 'open' ? 'clubs.policy_open_short' : 'clubs.policy_invite_short'), 'clubs__badge'));
    return li;
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
      const prev = el('button', t('rankings.prev'));
      const next = el('button', t('rankings.next'));
      prev.type = next.type = 'button';
      prev.disabled = pg.page <= 1;
      next.disabled = pg.page >= pg.totalPages;
      prev.onclick = () => { state.page--; loadList(); };
      next.onclick = () => { state.page++; loadList(); };
      pager.append(prev, el('span', pg.page + ' / ' + pg.totalPages), next);
    }
  }

  async function loadMine() {
    const res = await fetch('/api/clubs/mine', { credentials: 'same-origin' });
    if (!res.ok) return; // logged out: discover only
    const { clubs } = await res.json();
    $('cl-create-panel').hidden = false;
    $('cl-mine-panel').hidden = clubs.length === 0;
    $('cl-mine').replaceChildren(...clubs.map((c) => {
      const li = document.createElement('li');
      const a = el('a', c.name);
      a.href = '/c/' + encodeURIComponent(c.slug);
      li.append(a, el('span', t('clubs.role_' + c.role), 'clubs__badge'));
      return li;
    }));
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
    $('cl-form').addEventListener('submit', create);
    loadMine();
    loadList();
  });
})();
