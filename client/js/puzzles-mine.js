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

  /** Inline title edit; PATCH keeps status and solves (#334). */
  function startRename(p, nameEl, btn) {
    const input = el('input', undefined, 'pz-rename');
    input.type = 'text';
    input.maxLength = 60;
    input.value = p.title;
    const save = el('button', t('puzzles.save'), 'pbtn pbtn--primary pbtn--sm');
    save.type = 'button';
    const err = el('small', undefined, 'pz-rename-form__err');
    err.setAttribute('role', 'alert');
    const holder = el('span', undefined, 'pz-rename-form');
    const fail = (text) => {
      err.replaceChildren(window.PlatformShell.icon('ph-regular-warning'), document.createTextNode(text));
      input.setAttribute('aria-invalid', 'true');
      save.disabled = false;
    };
    holder.append(input, save, err);
    nameEl.replaceWith(holder);
    btn.hidden = true;
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); err.replaceChildren(); });
    input.focus();
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const res = await fetch('/api/puzzles/' + encodeURIComponent(p.id) + '/title', {
          method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: input.value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { fail(data.code ? t('err.' + data.code.toLowerCase()) : t('puzzles.rename_error')); return; }
        p.title = data.title;
        nameEl.textContent = window.PuzzleBoard.name(p);
        holder.replaceWith(nameEl);
        btn.hidden = false;
      } catch (_) { fail(t('puzzles.rename_error')); }
    });
  }

  function row(p) {
    const r = el('div', undefined, 'prow pz-mine');
    const main = el('div', undefined, 'pz-mine__main');
    const nameEl = el('b', window.PuzzleBoard.name(p));
    main.append(nameEl, el('span', t('puzzles.status_' + p.status), 'pbadge pz-st pz-st--' + p.status),
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
    const rename = el('button', t('puzzles.rename'), 'pbtn pbtn--ghost pbtn--sm');
    rename.type = 'button';
    rename.addEventListener('click', () => startRename(p, nameEl, rename));
    actions.appendChild(rename);
    r.appendChild(actions);
    return r;
  }

  async function init() {
    window.PlatformShell.build('learn');
    const msg = $('mn-msg');
    let canReview = false;
    const u = window.GvnSession && window.GvnSession.getUser && window.GvnSession.getUser();
    // No cached member session → say so without the doomed 401 probe (#275).
    if (window.GvnSession && (!u || u.isGuest)) { msg.hidden = false; msg.textContent = t('puzzles.login_to_submit'); $('mn-actions').hidden = true; return; }

    function renderPager(pg) {
      const host = $('mn-pager');
      host.replaceChildren();
      if (pg.totalPages <= 1) return;
      const prev = el('button', t('rankings.prev'), 'pbtn');
      const next = el('button', t('rankings.next'), 'pbtn');
      prev.type = next.type = 'button';
      prev.disabled = pg.page <= 1;
      next.disabled = pg.page >= pg.totalPages;
      prev.addEventListener('click', () => loadPage(pg.page - 1, true));
      next.addEventListener('click', () => loadPage(pg.page + 1, true));
      host.append(prev, el('span', pg.page + ' / ' + pg.totalPages), next);
    }

    /** One page of my puzzles (20 a page, like the public list); false when the page could not be shown. */
    async function loadPage(page, toTop) {
      try {
        const res = await fetch('/api/puzzles/mine' + (page > 1 ? '?page=' + page : ''), { credentials: 'same-origin' });
        if (res.status === 401 || res.status === 403) { msg.hidden = false; msg.textContent = t('puzzles.login_to_submit'); return false; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const { puzzles, pagination } = data;
        canReview = !!data.canReview;
        const list = $('mn-list');
        list.replaceChildren(...puzzles.map(row));
        $('mn-count').textContent = t('puzzles.total', { n: pagination.total });
        renderPager(pagination);
        if (!puzzles.length) { msg.hidden = false; msg.textContent = t('puzzles.mine_empty'); }
        if (toTop && list.scrollIntoView) list.scrollIntoView({ block: 'start' });
        return true;
      } catch (err) {
        msg.hidden = false;
        msg.textContent = t('puzzles.error');
        return false;
      }
    }
    if (!(await loadPage(1, false))) return;
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
