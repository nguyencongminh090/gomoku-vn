/**
 * admin-reports.js — "Tất cả báo cáo" tab of /admin (B210c): the mockup's single table
 * (Loại · Đối tượng · Người báo · Thời gian · Xem xét) over the open forum + cheat queues.
 * Read-only index: page 1 of each queue merged newest first; "Xem xét" jumps to that queue's own
 * tab, where the resolve actions live. A queue the caller may not read (403) is skipped.
 * Exposes window.AdminReports.init().
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const EXCERPT = 60;
  let started = false;

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  const clip = (s) => (s.length > EXCERPT ? s.slice(0, EXCERPT - 1) + '…' : s);

  async function fetchQueue(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data && Array.isArray(data.reports) ? data : null;
  }

  /** Both queues → one list of { kind, target, reporter, at } plus the open total across them. */
  function merge(forum, cheat) {
    const rows = [];
    if (forum) for (const r of forum.reports) rows.push({ kind: 'forum', target: r.targetDeleted ? t('forum.deleted') : clip(r.excerpt || ''), reporter: r.reporter.displayName, at: r.createdAt });
    if (cheat) for (const r of cheat.reports) rows.push({ kind: 'cheat', target: r.accused.displayName, reporter: r.reporter.displayName, at: r.createdAt });
    rows.sort((a, b) => new Date(b.at) - new Date(a.at));
    const total = (forum ? forum.pagination.total : 0) + (cheat ? cheat.pagination.total : 0);
    return { rows, total };
  }

  function table(rows) {
    const tbl = el('table', undefined, 'ptable');
    const head = el('tr');
    for (const k of ['r_col_kind', 'r_col_target', 'r_col_reporter', 'r_col_time', 'r_col_review']) {
      const th = el('th', t('admin.' + k));
      th.scope = 'col';
      head.appendChild(th);
    }
    tbl.appendChild(el('thead')).appendChild(head);
    const body = el('tbody');
    for (const r of rows) {
      const tr = el('tr');
      const kind = el('td');
      kind.appendChild(el('span', t('admin.r_kind_' + r.kind), 'pbadge'));
      const review = el('td');
      const go = el('button', t('admin.r_review'), 'pbtn pbtn--ghost pbtn--sm');
      go.type = 'button';
      go.addEventListener('click', () => { location.hash = r.kind; });
      review.appendChild(go);
      const when = el('time', new Date(r.at).toLocaleString(), 'muted small');
      const timeTd = el('td');
      timeTd.appendChild(when);
      tr.append(kind, el('td', r.target), el('td', r.reporter), timeTd, review);
      body.appendChild(tr);
    }
    tbl.appendChild(body);
    return tbl;
  }

  async function load() {
    const msg = $('rl-msg');
    try {
      const [forum, cheat] = await Promise.all([
        fetchQueue('/api/forum/reports?page=1').catch(() => null),
        fetchQueue('/api/admin/cheat-reports?page=1').catch(() => null),
      ]);
      const { rows, total } = merge(forum, cheat);
      $('rl-total').textContent = t('admin.r_open', { n: total });
      $('rl-table').replaceChildren(...(rows.length ? [table(rows)] : []));
      msg.hidden = rows.length > 0;
      msg.textContent = t('admin.r_empty');
    } catch (err) {
      msg.hidden = false;
      msg.textContent = t('admin.error');
    }
  }

  window.AdminReports = { init() { if (!started) { started = true; load(); } }, _merge: merge };
})();
