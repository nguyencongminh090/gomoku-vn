/**
 * puzzles-mine.js — the author's own puzzles (#203 7a-3), page /puzzles/mine.
 * GET /api/puzzles/mine (member) → { puzzles, canReview }. Admins (canReview) also get a link to the review
 * queue; the server re-checks is_admin on that page's own request. #508: status tiles from `counts`, and the
 * page's rejected puzzles ("needs your action") come first, then the active ones, each fact in its own chip.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);

  function withIcon(node, name) { if (window.PlatformShell && window.PlatformShell.icon) node.prepend(window.PlatformShell.icon(name)); return node; }

  /** A titled group of puzzle cards. */
  function section(titleKey, rows) {
    const sec = el('section', undefined, 'pz-mine-sec');
    const grid = el('div', undefined, 'pz-mine-grid');
    grid.append(...rows);
    sec.append(el('h2', t(titleKey), 'pz-h2'), grid);
    return sec;
  }

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
    const save = el('button', t('puzzles.save'), 'mtbtn mtbtn--sm');
    save.type = 'button';
    const cancel = el('button', t('modal.btn_cancel'), 'mtbtn mtbtn--quiet mtbtn--sm');
    cancel.type = 'button';
    const rowEl = btn.closest('.pz-mine');
    const err = el('small', undefined, 'pz-rename-form__err');
    err.setAttribute('role', 'alert');
    const holder = el('span', undefined, 'pz-rename-form');
    const fail = (text) => {
      err.replaceChildren(window.PlatformShell.icon('ph-regular-warning'), document.createTextNode(text));
      input.setAttribute('aria-invalid', 'true');
      save.disabled = false;
    };
    const close = () => { holder.replaceWith(nameEl); btn.hidden = false; if (rowEl) rowEl.classList.remove('pz-mine--editing'); btn.focus(); };
    holder.append(input, save, cancel, err);
    nameEl.replaceWith(holder);
    btn.hidden = true;
    if (rowEl) rowEl.classList.add('pz-mine--editing');
    cancel.addEventListener('click', close);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); save.click(); }
      else if (e.key === 'Escape') close();
    });
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); err.replaceChildren(); });
    input.focus();
    input.select();
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
        close();
      } catch (_) { fail(t('puzzles.rename_error')); }
    });
  }

  function row(p, onDeleted) {
    const r = el('div', undefined, 'prow pz-mine');
    const main = el('div', undefined, 'pz-mine__main');
    const nameEl = el('b', window.PuzzleBoard.name(p));
    main.append(nameEl, el('span', t('puzzles.status_' + p.status), 'pz-tag pz-tag--' + p.status));
    const facts = el('div', undefined, 'pz-row');
    facts.append(el('span', t('puzzles.level_' + p.level), 'pz-tag pz-tag--lv-' + p.level), el('span', t('puzzles.rule_' + p.rule), 'pz-tag'),
      el('span', p.boardSize + '×' + p.boardSize, 'pz-tag'));
    r.append(main, facts);
    if (p.status === 'rejected' && p.reviewNote) r.appendChild(el('p', t('puzzles.reject_note', { note: p.reviewNote }), 'pz-result is-wrong pz-mine__note'));
    const actions = el('div', undefined, 'pactions');
    const edit = withIcon(el('a', t('puzzles.edit'), 'mtbtn mtbtn--sm'), 'ph-regular-pencil-simple');
    edit.href = '/puzzles/new?id=' + encodeURIComponent(p.id);
    actions.appendChild(edit);
    if (p.status === 'approved') {
      const view = el('a', t('puzzles.view'), 'mtbtn mtbtn--quiet mtbtn--sm');
      view.href = '/puzzle/' + encodeURIComponent(p.id);
      actions.appendChild(view);
    }
    const rename = el('button', t('puzzles.rename'), 'mtbtn mtbtn--quiet mtbtn--sm');
    rename.type = 'button';
    rename.addEventListener('click', () => startRename(p, nameEl, rename));
    actions.appendChild(rename);
    const del = el('button', t('puzzles.delete'), 'mtbtn mtbtn--danger mtbtn--sm');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!window.confirm(t('puzzles.delete_confirm', { title: p.title }))) return;
      del.disabled = true;
      try {
        const res = await fetch('/api/puzzles/' + encodeURIComponent(p.id), { method: 'DELETE', credentials: 'same-origin' });
        if (!res.ok && res.status !== 404) throw new Error('HTTP ' + res.status);
        onDeleted();
      } catch (_) {
        del.disabled = false;
        window.alert(t('puzzles.delete_error'));
      }
    });
    actions.appendChild(del);
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
      const prev = el('button', t('rankings.prev'), 'mtbtn mtbtn--quiet');
      const next = el('button', t('rankings.next'), 'mtbtn mtbtn--quiet');
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
        const mk = (p) => row(p, () => loadPage(page > 1 && puzzles.length === 1 ? page - 1 : page, false));
        const needs = puzzles.filter((p) => p.status === 'rejected');
        const active = puzzles.filter((p) => p.status !== 'rejected');
        list.replaceChildren(...[needs.length && section('puzzles.mine_needs', needs.map(mk)), active.length && section('puzzles.mine_active', active.map(mk))].filter(Boolean));
        $('mn-count').textContent = t('puzzles.total', { n: pagination.total });
        const c = data.counts;
        $('mn-stats').hidden = !c || !pagination.total;
        if (c) for (const k of ['pending', 'approved', 'rejected']) $('mn-n-' + k).textContent = String(c[k] || 0);
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
