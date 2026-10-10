/**
 * forum.js — thread list + new-thread form (#203 7c), page /forum.
 * GET /api/forum/threads?category=&page=; members post via POST /api/forum/threads.
 */

'use strict';

(function () {
  const { t, el, errMsg, isMember, when, pager, say, send } = window.Forum;
  const $ = (id) => document.getElementById(id);
  const CATS = ['general', 'tactics', 'analysis', 'help'];

  const params = new URLSearchParams(location.search);
  const state = { category: CATS.includes(params.get('category')) ? params.get('category') : '', page: Math.max(1, parseInt(params.get('page'), 10) || 1) };
  let member = false;

  function renderCats() {
    const host = $('fm-cats');
    host.replaceChildren();
    for (const c of ['', ...CATS]) {
      const b = el('button', c ? t('forum.cat_' + c) : t('forum.cat_all'), 'pchip');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.category === c));
      b.addEventListener('click', () => { state.category = c; state.page = 1; load(); });
      host.appendChild(b);
    }
  }

  function renderRows(data) {
    const list = $('fm-list');
    list.replaceChildren();
    for (const th of data.threads) {
      const a = el('a', undefined, 'prow fm-row');
      a.href = '/forum/t/' + encodeURIComponent(th.id);
      const meta = el('span', undefined, 'fm-row__meta');
      meta.append(
        el('span', t('forum.cat_' + th.category), 'pbadge'),
        el('span', th.author.displayName),
        el('span', t('forum.replies', { n: th.replyCount })),
        el('time', when(th.lastPostAt)),
      );
      a.append(el('span', th.title, 'fm-row__title'), meta);
      list.appendChild(a);
    }
    $('fm-empty').hidden = data.threads.length > 0;
    $('fm-empty').textContent = t('forum.empty');
    $('fm-total').textContent = t('forum.total', { n: data.pagination.total });
    const rep = $('fm-reports');
    rep.hidden = !data.canModerate;
    rep.textContent = t('forum.reports_link');
  }

  async function load() {
    renderCats();
    const q = new URLSearchParams();
    if (state.category) q.set('category', state.category);
    if (state.page > 1) q.set('page', String(state.page));
    history.replaceState(null, '', '?' + q.toString());
    try {
      const res = await fetch('/api/forum/threads?' + q.toString(), { credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderRows(data);
      pager($('fm-pager'), data.pagination, (p) => { state.page = p; load(); });
    } catch (err) {
      $('fm-list').replaceChildren();
      $('fm-empty').hidden = false;
      $('fm-empty').textContent = t('forum.error');
    }
  }

  async function submitNew(ev) {
    ev.preventDefault();
    const out = $('fm-new-result');
    say(out, '');
    $('fm-new-submit').disabled = true;
    const { ok, data } = await send('POST', '/api/forum/threads', {
      category: $('fm-new-cat').value, title: $('fm-new-title').value, body: $('fm-new-body').value,
    });
    $('fm-new-submit').disabled = false;
    if (!ok) return say(out, errMsg(data));
    location.href = '/forum/t/' + encodeURIComponent(data.id);
  }

  async function init() {
    window.PlatformShell.build('learn');
    member = await isMember();
    const sel = $('fm-new-cat');
    for (const c of CATS) { const o = el('option', t('forum.cat_' + c)); o.value = c; sel.appendChild(o); }
    if (state.category) sel.value = state.category;
    $('fm-new-btn').hidden = !member;
    $('fm-login').hidden = member;
    $('fm-login').textContent = t('forum.login_to_post');
    $('fm-new-btn').addEventListener('click', () => { $('fm-new').hidden = !$('fm-new').hidden; if (!$('fm-new').hidden) $('fm-new-title').focus(); });
    $('fm-new').addEventListener('submit', submitNew);
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
