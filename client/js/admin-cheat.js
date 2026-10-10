/**
 * admin-cheat.js — "Gian lận" tab of /admin (R8 #208). GET /api/admin/cheat-reports (perm
 * cheat.review: moderator + admin), POST /cheat-reports/:id/resolve {confirm}. Confirm logs a
 * graph edge only; locking stays in the Users tab. Exposes window.AdminCheat.init().
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  let started = false;
  let page = 1;

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  const apiError = (data) => (data && data.code ? t('err.' + data.code.toLowerCase()) : t('admin.error'));

  function row(r, reload) {
    const box = el('div', undefined, 'prow fm-report');
    const head = el('div', undefined, 'fm-meta');
    head.append(el('b', r.accused.displayName), el('span', r.accused.username, 'muted small'),
      el('span', t('admin.c_history', { open: r.accusedOpenGames, confirmed: r.accusedConfirmedGames }), 'pbadge'),
      el('span', t('admin.c_by', { name: r.reporter.displayName }), 'muted small'),
      el('time', new Date(r.createdAt).toLocaleString(), 'muted small'));
    box.appendChild(head);
    if (r.game) {
      const g = el('p', undefined, 'pnote');
      const link = el('a', t('admin.c_open_replay'));
      link.href = '/replay/' + encodeURIComponent(r.game.id);
      link.target = '_blank';
      link.rel = 'noopener';
      g.append(el('span', t('admin.c_game', { black: r.game.black, white: r.game.white, side: t('admin.c_side_' + r.game.accusedSide) }) + ' '), link);
      box.appendChild(g);
    }
    box.appendChild(el('p', t('forum.reason', { reason: r.reason }), 'pnote'));
    const actions = el('div', undefined, 'pactions');
    const act = (label, confirm, cls) => {
      const b = el('button', label, cls);
      b.type = 'button';
      b.addEventListener('click', async () => {
        b.disabled = true;
        const res = await fetch('/api/admin/cheat-reports/' + encodeURIComponent(r.id) + '/resolve', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { b.disabled = false; window.alert(apiError(data)); if (res.status === 409) reload(); return; }
        reload();
      });
      return b;
    };
    actions.append(act(t('admin.c_dismiss'), false, 'pbtn pbtn--ghost pbtn--sm'), act(t('admin.c_confirm'), true, 'pbtn pbtn--primary pbtn--sm'));
    box.appendChild(actions);
    return box;
  }

  async function load() {
    const msg = $('ch-msg');
    try {
      const res = await fetch('/api/admin/cheat-reports?page=' + page, { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { msg.hidden = false; msg.textContent = apiError(data); $('ch-list').replaceChildren(); return; }
      $('ch-list').replaceChildren(...data.reports.map((r) => row(r, load)));
      $('ch-total').textContent = t('admin.c_open', { n: data.pagination.total });
      msg.hidden = data.reports.length > 0;
      msg.textContent = t('admin.c_empty');
      if (window.Forum) window.Forum.pager($('ch-pager'), data.pagination, (p) => { page = p; load(); });
    } catch (err) {
      msg.hidden = false;
      msg.textContent = t('admin.error');
    }
  }

  window.AdminCheat = { init() { if (!started) { started = true; load(); } } };
})();
