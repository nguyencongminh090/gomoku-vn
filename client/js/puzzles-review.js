/**
 * puzzles-review.js — puzzle review queue (#203 7a-3), a tab of /admin (R8 #205; /puzzles/review redirects there).
 * Exposes window.PuzzlesReview.init(); admin.js calls it when the tab is first shown.
 * GET /api/puzzles/review (403 PUZZLE_FORBIDDEN for non-admins — the server is the gate, this
 * page only reports it), POST /api/puzzles/:id/review {decision, level, note}. Shows each
 * pending puzzle's board with its accepted answer lines (click to preview), each line's engine
 * verdict (#331: verified win / breaks at move k / unchecked — a hint, the reviewer still decides)
 * and how many other puzzles share the position (duplicates). Below the queue: recent renames (#337,
 * GET /api/puzzles/renames).
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const LEVELS = ['easy', 'medium', 'hard', 'expert'];

  let queue = [];
  let current = null;
  let line = [];        // answer line previewed on the board
  let renderer = null;

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  /** Text for one PuzzleVerifier verdict; null when the server sent none. */
  function verdictText(v) {
    if (!v) return null;
    if (v.status === 'verified') return t('puzzles.rv_v_verified', { n: v.step });
    if (v.status === 'breaks') return t('puzzles.rv_v_breaks_' + v.reason, { n: v.step });
    return t('puzzles.rv_v_unchecked');
  }

  const flagged = (p) => (p.verification || []).some((v) => v.status === 'breaks');

  const apiError = (data) => (data && data.code ? t('err.' + data.code.toLowerCase()) : t('puzzles.error'));

  function say(msg, good) {
    const r = $('rv-result');
    r.hidden = !msg;
    r.className = 'pz-result ' + (good ? 'is-right' : 'is-wrong');
    r.textContent = msg || '';
  }

  function draw() {
    if (!current) return;
    renderer.setState(window.PuzzleBoard.state(current.boardSize, current.stones, current.toMove, line, { interactive: false }));
  }

  function select(p) {
    current = p;
    line = [];
    say('');
    $('rv-detail').hidden = false;
    $('rv-title').textContent = window.PuzzleBoard.name(p);
    $('rv-prompt').textContent = p.prompt || '';
    const meta = $('rv-meta');
    meta.replaceChildren(
      el('span', t('puzzles.rule_' + p.rule) + ' · ' + p.boardSize + '×' + p.boardSize + ' · ' + t('puzzles.mode_' + p.mode), 'muted small'),
      ...p.tags.map((tg) => el('span', t('puzzles.tag_' + tg), 'pbadge')),
      el('small', t('puzzles.by', { name: p.author ? p.author.displayName : '?' }), 'muted'),
    );
    const dup = $('rv-dup');
    dup.hidden = !p.duplicates;
    dup.textContent = t('puzzles.rv_duplicates', { n: p.duplicates });
    const answers = $('rv-answers');
    answers.replaceChildren();
    p.answers.forEach((a, i) => {
      const b = el('button', (i + 1) + '. ' + a.map((c) => window.Coords.label(c.x, c.y, p.boardSize)).join(', '), 'pchip');
      b.type = 'button';
      b.addEventListener('click', () => { line = a; draw(); });
      const v = p.verification && p.verification[i];
      const text = verdictText(v);
      if (text) b.appendChild(el('small', ' · ' + text, 'pz-verdict pz-verdict--' + v.status));
      answers.appendChild(b);
    });
    $('rv-verify').hidden = !flagged(p);
    $('rv-level').value = p.level;
    $('rv-note').value = '';
    if (!renderer) renderer = new window.BoardRenderer($('rv-canvas'), { boardSize: p.boardSize, clickMode: 'single' });
    renderer.boardSize = p.boardSize;
    requestAnimationFrame(() => { renderer.resize(); draw(); });
  }

  function renderQueue() {
    const list = $('rv-list');
    list.replaceChildren();
    for (const p of queue) {
      const r = el('button', undefined, 'prow pz-rv-row' + (current && current.id === p.id ? ' is-active' : ''));
      r.type = 'button';
      r.append(el('b', window.PuzzleBoard.name(p)), el('span', t('puzzles.level_' + p.level), 'pbadge'));
      if (p.duplicates) r.appendChild(el('span', t('puzzles.rv_dup_badge', { n: p.duplicates }), 'pbadge pz-dup'));
      if (flagged(p)) r.appendChild(el('span', t('puzzles.rv_v_flag_badge'), 'pbadge pz-dup'));
      r.addEventListener('click', () => { select(p); renderQueue(); });
      list.appendChild(r);
    }
    $('rv-total').textContent = t('puzzles.rv_pending', { n: queue.length });
    if (!queue.length) {
      $('rv-msg').hidden = false;
      $('rv-msg').textContent = t('puzzles.rv_empty');
      $('rv-detail').hidden = true;
    }
  }

  async function decide(decision) {
    if (!current) return;
    const note = $('rv-note').value.trim();
    if (decision === 'reject' && !note) { say(t('puzzles.rv_note_required')); return; }
    $('rv-approve').disabled = $('rv-reject').disabled = true;
    try {
      const res = await fetch('/api/puzzles/' + encodeURIComponent(current.id) + '/review', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, level: $('rv-level').value, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { say(apiError(data)); return; }
      queue = queue.filter((p) => p.id !== current.id);
      current = null;
      $('rv-detail').hidden = true;
      renderQueue();
      if (queue.length) { select(queue[0]); renderQueue(); }
    } catch (err) {
      say(t('puzzles.error'));
    } finally {
      $('rv-approve').disabled = $('rv-reject').disabled = false;
    }
  }

  /** Permanent delete of the open puzzle (DELETE /api/puzzles/:id); the queue moves on to the next one. */
  async function remove() {
    if (!current || !window.confirm(t('puzzles.delete_confirm', { title: current.title }))) return;
    $('rv-delete').disabled = true;
    try {
      const res = await fetch('/api/puzzles/' + encodeURIComponent(current.id), { method: 'DELETE', credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 404) { say(apiError(data)); return; }
      queue = queue.filter((p) => p.id !== current.id);
      current = null;
      $('rv-detail').hidden = true;
      renderQueue();
      if (queue.length) { select(queue[0]); renderQueue(); }
    } catch (err) {
      say(t('puzzles.delete_error'));
    } finally {
      $('rv-delete').disabled = false;
    }
  }

  /** #337: recent title changes (author/reviewer renames keep the status, so they are not in the queue). */
  async function loadRenames() {
    try {
      const res = await fetch('/api/puzzles/renames', { credentials: 'same-origin' });
      if (!res.ok) return;
      const { renames, pagination } = await res.json();
      const list = $('rn-list');
      list.replaceChildren(...renames.map((r) => {
        const row = el('div', undefined, 'prow pz-rn');
        const link = el('a', window.PuzzleBoard.name({ title: r.newTitle, number: r.number }));
        link.href = '/puzzle/' + encodeURIComponent(r.puzzleId);
        row.append(el('span', r.oldTitle, 'muted pz-rn__old'), el('span', '→', 'muted'), link,
          el('small', t('puzzles.by', { name: r.by.displayName }) + ' · ' + new Date(r.createdAt).toLocaleString(), 'muted'));
        return row;
      }));
      $('rv-renames').hidden = !renames.length;
      const more = $('rn-more');
      more.hidden = pagination.total <= renames.length;
      more.textContent = t('puzzles.rn_more', { n: pagination.total - renames.length });
    } catch (err) { /* the log is secondary; the queue still works */ }
  }

  let started = false;

  async function init() {
    if (started) return;
    started = true;
    const msg = $('rv-msg');
    const sel = $('rv-level');
    for (const l of LEVELS) { const o = el('option', t('puzzles.level_' + l)); o.value = l; sel.appendChild(o); }
    try {
      const res = await fetch('/api/puzzles/review', { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { msg.hidden = false; msg.textContent = res.status === 401 ? t('puzzles.login_to_submit') : apiError(data); return; }
      queue = data.puzzles;
    } catch (err) { msg.hidden = false; msg.textContent = t('puzzles.error'); return; }
    $('rv-view').hidden = false;
    $('rv-approve').addEventListener('click', () => decide('approve'));
    $('rv-reject').addEventListener('click', () => decide('reject'));
    $('rv-delete').addEventListener('click', remove);
    $('rv-form').addEventListener('submit', (e) => e.preventDefault());
    if (queue.length) select(queue[0]);
    renderQueue();
    loadRenames();
    window.addEventListener('resize', () => { if (renderer) { renderer.resize(); draw(); } });
  }

  window.PuzzlesReview = { init };
})();
