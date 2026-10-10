/**
 * puzzles-mine.js — the author's own puzzles (#203 7a-3), page /puzzles/mine.
 * GET /api/puzzles/mine (member) → { puzzles, canReview }. Admins (canReview) also get a link to the review
 * queue; the server re-checks is_admin on that page's own request.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function row(p) {
    const r = el('div', undefined, 'prow pz-mine');
    const main = el('div', undefined, 'pz-mine__main');
    main.append(el('b', p.title), el('span', t('puzzles.status_' + p.status), 'pbadge pz-st pz-st--' + p.status),
      el('span', t('puzzles.level_' + p.level) + ' · ' + t('puzzles.rule_' + p.rule) + ' · ' + p.boardSize + '×' + p.boardSize, 'muted small'));
    r.appendChild(main);
    if (p.status === 'rejected' && p.reviewNote) r.appendChild(el('p', t('puzzles.reject_note', { note: p.reviewNote }), 'pnote pz-mine__note'));
    const actions = el('div', undefined, 'pactions');
    const edit = el('a', t('puzzles.edit'), 'pbtn pbtn--ghost pbtn--sm');
    edit.href = '/puzzles/new?id=' + encodeURIComponent(p.id);
    actions.appendChild(edit);
    if (p.status === 'approved') {
      const view = el('a', t('puzzles.view'), 'pbtn pbtn--ghost pbtn--sm');
      view.href = '/puzzle/' + encodeURIComponent(p.id);
      actions.appendChild(view);
    }
    r.appendChild(actions);
    return r;
  }

  async function init() {
    window.PlatformShell.build('learn');
    const msg = $('mn-msg');
    let canReview = false;
    try {
      const res = await fetch('/api/puzzles/mine', { credentials: 'same-origin' });
      if (res.status === 401 || res.status === 403) { msg.hidden = false; msg.textContent = t('puzzles.login_to_submit'); return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const { puzzles } = data;
      canReview = !!data.canReview;
      const list = $('mn-list');
      list.replaceChildren(...puzzles.map(row));
      $('mn-count').textContent = t('puzzles.total', { n: puzzles.length });
      if (!puzzles.length) { msg.hidden = false; msg.textContent = t('puzzles.mine_empty'); }
    } catch (err) {
      msg.hidden = false;
      msg.textContent = t('puzzles.error');
      return;
    }
    if (!canReview) return;
    try {
      const rv = await fetch('/api/puzzles/review', { credentials: 'same-origin' });
      if (rv.ok) {
        const d = await rv.json();
        const a = $('mn-review');
        a.hidden = false;
        a.textContent = t('puzzles.review_link', { n: d.pagination.total });
      }
    } catch (_) { /* not an admin / offline: no link */ }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
