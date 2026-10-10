/**
 * forum-reports.js — staff report queue (#203 7c), a tab of /admin (R8 #205; /forum/reports redirects there).
 * Exposes window.ForumReports.init(); admin.js calls it when the tab is first shown.
 * GET /api/forum/reports (403 for non-staff: the server is the gate), POST /reports/:id/resolve {remove}.
 */

'use strict';

(function () {
  const { t, el, errMsg, when, pager, send } = window.Forum;
  const $ = (id) => document.getElementById(id);
  let page = 1;

  function row(r, reload) {
    const box = el('div', undefined, 'prow fm-report');
    const head = el('div', undefined, 'fm-meta');
    const link = el('a', t('forum.open_thread'));
    link.href = '/forum/t/' + encodeURIComponent(r.threadId);
    head.append(el('span', t('forum.target_' + r.type), 'pbadge'), el('span', t('forum.reported_by', { name: r.reporter.displayName }), 'muted small'),
      el('time', when(r.createdAt), 'muted small'), link);
    box.append(head, el('p', r.targetDeleted ? t('forum.deleted') : r.excerpt, 'fm-report__excerpt'), el('p', t('forum.reason', { reason: r.reason }), 'pnote'));
    const actions = el('div', undefined, 'pactions');
    const act = (label, remove, cls) => {
      const b = el('button', label, cls);
      b.type = 'button';
      b.addEventListener('click', async () => {
        b.disabled = true;
        const res = await send('POST', '/api/forum/reports/' + encodeURIComponent(r.id) + '/resolve', { remove });
        if (!res.ok) { b.disabled = false; return window.alert(errMsg(res.data)); }
        reload();
      });
      return b;
    };
    actions.append(act(t('forum.dismiss'), false, 'pbtn pbtn--ghost pbtn--sm'));
    if (!r.targetDeleted) actions.appendChild(act(t('forum.remove_content'), true, 'pbtn pbtn--primary pbtn--sm'));
    box.appendChild(actions);
    return box;
  }

  async function load() {
    const msg = $('rp-msg');
    try {
      const res = await fetch('/api/forum/reports?page=' + page, { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        msg.hidden = false;
        msg.textContent = res.status === 401 ? t('forum.login_to_post') : errMsg(data);
        $('rp-list').replaceChildren();
        return;
      }
      $('rp-list').replaceChildren(...data.reports.map((r) => row(r, load)));
      $('rp-total').textContent = t('forum.reports_open', { n: data.pagination.total });
      msg.hidden = data.reports.length > 0;
      msg.textContent = t('forum.reports_empty');
      pager($('rp-pager'), data.pagination, (p) => { page = p; load(); });
    } catch (err) {
      msg.hidden = false;
      msg.textContent = t('forum.error');
    }
  }

  let started = false;
  window.ForumReports = { init() { if (!started) { started = true; load(); } } };
})();
