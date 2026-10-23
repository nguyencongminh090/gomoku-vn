/**
 * puzzle.js — solve one puzzle (#203 7a-2), page /puzzle/<id>.
 *
 * GET /api/puzzles/:id (no answers) → static board. The solver enters ONLY their own moves,
 * by clicking the board or typing coordinates (`H8` letters or `122` sequence numbers, via
 * Coords.parseList); POST /api/puzzles/:id/solve {moves} → {correct}. The answer never reaches
 * this page — the server compares. Guests can look but not check (the API is member-only).
 * BoardRenderer is used through setState/onCellClick only.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);

  const errorEl = $('pz-error');
  const viewEl = $('pz-view');
  const movesEl = $('pz-moves');
  const inputEl = $('pz-input');
  const resultEl = $('pz-result');
  const loginEl = $('pz-login');
  const attemptsEl = $('pz-attempts');

  let puzzle = null;
  let renderer = null;
  let moves = [];        // solver's cells, in entry order
  let solved = false;
  let member = false;
  let attemptsLeft = null; // null = unlimited (solved) or not a member

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function showError(msg) {
    viewEl.hidden = true;
    errorEl.hidden = false;
    errorEl.textContent = msg;
  }

  const apiError = (data, fallback) => (data && data.code ? t('err.' + data.code.toLowerCase()) : fallback);

  function drawBoard() {
    renderer.setState(window.PuzzleBoard.state(puzzle.boardSize, puzzle.stones, puzzle.toMove, moves, { interactive: !solved, walls: puzzle.walls, portals: puzzle.portals }));
  }

  function renderMoves() {
    movesEl.replaceChildren();
    if (!moves.length) {
      movesEl.appendChild(el('span', t('puzzles.no_moves'), 'muted small'));
    }
    moves.forEach((m, i) => {
      movesEl.appendChild(el('span', (i + 1) + '. ' + window.Coords.label(m.x, m.y, puzzle.boardSize), 'pbadge'));
    });
    inputEl.value = moves.map((m) => window.Coords.label(m.x, m.y, puzzle.boardSize)).join(', ');
    $('pz-undo').disabled = solved || !moves.length;
    $('pz-clear').disabled = solved || !moves.length;
    $('pz-submit').disabled = solved || attemptsLeft === 0; // typed text is only parsed on submit, so it must stay clickable with no moves yet
  }

  function renderAttempts(info) {
    if (info) attemptsLeft = info.attemptsLeft === undefined ? null : info.attemptsLeft;
    attemptsEl.hidden = !member || solved || attemptsLeft === null;
    if (!attemptsEl.hidden) attemptsEl.textContent = t(attemptsLeft ? 'puzzles.attempts_left' : 'puzzles.attempts_none', { n: attemptsLeft });
  }

  function who(s) {
    const a = el('a', s.displayName, 'prow__link');
    a.href = '/profile/' + encodeURIComponent(s.username);
    const n = el('span', t('puzzles.solver_tries', { n: s.tries }), 'muted small');
    const row = el('div', undefined, 'prow');
    const av = window.PlatformShell && window.PlatformShell.avatar ? window.PlatformShell.avatar(s.avatarUrl, s.displayName, 'avatar--sm') : null;
    if (av) row.appendChild(av);
    row.append(a, n);
    return row;
  }

  async function loadSolvers() {
    try {
      const res = await fetch('/api/puzzles/' + encodeURIComponent(puzzle.id) + '/solvers', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      $('pz-solvers').hidden = false;
      $('pz-solvers-h').textContent = t('puzzles.solvers_h', { n: data.total });
      $('pz-solvers-list').replaceChildren(...(data.solvers.length ? data.solvers.map(who) : [el('span', t('puzzles.solvers_none'), 'muted small')]));
    } catch (_) { /* optional panel */ }
  }

  async function loadHistory() {
    if (!member) return;
    try {
      const res = await fetch('/api/puzzles/' + encodeURIComponent(puzzle.id) + '/attempts', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      renderAttempts(data);
      $('pz-history').hidden = !data.attempts.length;
      $('pz-history-list').replaceChildren(...data.attempts.map((a) => el('span',
        a.moves.map((m) => window.Coords.label(m.x, m.y, puzzle.boardSize)).join(', ') + ' · ' + t(a.correct ? 'puzzles.attempt_right' : 'puzzles.attempt_wrong'), 'pbadge')));
    } catch (_) { /* optional panel */ }
  }

  function refresh() {
    resultEl.hidden = true;
    renderMoves();
    drawBoard();
  }

  /** Add one cell; final_move keeps a single cell, sequence appends (no duplicates, no stones). */
  function addMove(c) {
    if (solved) return;
    if (puzzle.stones.concat(puzzle.walls || [], ...(puzzle.portals || []).map((p) => [p.a, p.b])).some((s) => s.x === c.x && s.y === c.y)) return;
    if (puzzle.mode === 'final_move') {
      moves = [c];
    } else if (!moves.some((m) => m.x === c.x && m.y === c.y)) {
      moves = moves.concat([c]);
    }
    refresh();
  }

  /** Typed text replaces the whole list; bad text shows the invalid-coordinates message. */
  function applyTyped() {
    const text = inputEl.value.trim();
    if (!text) { moves = []; refresh(); return true; }
    const cells = window.Coords.parseList(text, puzzle.boardSize);
    const blocked = (puzzle.walls || []).concat(...(puzzle.portals || []).map((p) => [p.a, p.b]));
    const occupied = (c) => puzzle.stones.concat(blocked).some((s) => s.x === c.x && s.y === c.y);
    const distinct = cells && new Set(cells.map((c) => c.x + ',' + c.y)).size === cells.length;
    if (!cells || !distinct || cells.some(occupied) || (puzzle.mode === 'final_move' && cells.length !== 1)) {
      resultEl.hidden = false;
      resultEl.className = 'pz-result is-wrong';
      resultEl.textContent = t('err.puzzle_moves_invalid');
      return false;
    }
    moves = cells;
    refresh();
    return true;
  }

  async function submit(ev) {
    ev.preventDefault();
    if (solved || !applyTyped() || !moves.length) return;
    if (!member) { loginEl.hidden = false; return; }
    $('pz-submit').disabled = true;
    try {
      const res = await fetch('/api/puzzles/' + encodeURIComponent(puzzle.id) + '/solve', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves: moves.map((m) => window.Coords.label(m.x, m.y, puzzle.boardSize)) }),
      });
      const data = await res.json().catch(() => ({}));
      resultEl.hidden = false;
      if (!res.ok) {
        resultEl.className = 'pz-result is-wrong';
        resultEl.textContent = data.code === 'PUZZLE_ATTEMPTS_EXCEEDED' ? t('puzzles.attempts_none') : apiError(data, t('puzzles.error'));
        if (data.attemptsLeft !== undefined) renderAttempts(data);
      } else if (data.correct) {
        solved = true;
        resultEl.className = 'pz-result is-right';
        resultEl.textContent = t('puzzles.correct');
        if (window.PlatformShell && window.PlatformShell.icon) resultEl.prepend(window.PlatformShell.icon('ph-regular-check-circle'));
        $('pz-next').hidden = false;
        refresh();
        resultEl.hidden = false;
        renderAttempts(data);
      } else {
        resultEl.className = 'pz-result is-wrong';
        resultEl.textContent = t('puzzles.wrong');
        renderAttempts(data);
      }
      loadHistory();
      loadSolvers();
    } catch (err) {
      resultEl.hidden = false;
      resultEl.className = 'pz-result is-wrong';
      resultEl.textContent = t('puzzles.error');
    }
    renderMoves();
  }

  function renderInfo() {
    $('pz-title').textContent = window.PuzzleBoard.name(puzzle);
    $('pz-prompt').textContent = puzzle.prompt || '';
    $('pz-turn').textContent = t(puzzle.toMove === 'BLACK' ? 'puzzles.black_to_move' : 'puzzles.white_to_move');
    $('pz-input-label').textContent = t(puzzle.mode === 'final_move' ? 'puzzles.enter_final' : 'puzzles.enter_sequence');
    const meta = $('pz-meta');
    meta.replaceChildren(
      el('span', t('puzzles.level_' + puzzle.level), 'pbadge pz-lv pz-lv--' + puzzle.level),
      el('span', t('puzzles.rule_' + puzzle.rule) + ' · ' + puzzle.boardSize + '×' + puzzle.boardSize, 'muted small'),
    );
    for (const tg of puzzle.tags || []) meta.appendChild(el('span', t('puzzles.tag_' + tg), 'pbadge'));
    if (puzzle.author) meta.appendChild(el('small', t('puzzles.by', { name: puzzle.author.displayName }), 'muted'));
    document.title = 'Play3CR — ' + window.PuzzleBoard.name(puzzle);
    loginEl.textContent = t('puzzles.login_needed');
  }

  /** Guests carry a `guest_…` id (and isGuest in the cached session): /api/rankings/me answers 200 for them too. */
  function isGuestMe(m) {
    const u = window.GvnSession && window.GvnSession.getUser && window.GvnSession.getUser();
    return !!(u && u.isGuest) || !m || !m.userId || String(m.userId).startsWith('guest_');
  }

  async function init() {
    window.PlatformShell.build('learn');
    const id = decodeURIComponent((location.pathname.match(/^\/puzzle\/([^/]+)/) || [])[1] || '');
    if (!id) return showError(t('err.puzzle_not_found'));
    try {
      const res = await fetch('/api/puzzles/' + encodeURIComponent(id), { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return showError(apiError(data, t('puzzles.error')));
      puzzle = data.puzzle;
    } catch (err) {
      return showError(t('puzzles.error'));
    }
    try {
      const me = await (window.PlatformShell && window.PlatformShell.fetchMe ? window.PlatformShell.fetchMe() : fetch('/api/rankings/me', { credentials: 'same-origin' }));
      member = me.ok && !isGuestMe(await me.json().catch(() => ({})));
    } catch (_) { member = false; }
    solved = !!puzzle.solved;
    attemptsLeft = puzzle.attemptsLeft === undefined ? null : puzzle.attemptsLeft;

    viewEl.hidden = false;
    renderInfo();
    if (!member && !solved) loginEl.hidden = false;
    renderer = new window.BoardRenderer($('pz-canvas'), {
      boardSize: puzzle.boardSize,
      clickMode: 'single',
      onCellClick: (x, y) => addMove({ x, y }),
    });
    $('pz-form').addEventListener('submit', submit);
    $('pz-undo').addEventListener('click', () => { moves = moves.slice(0, -1); refresh(); });
    $('pz-clear').addEventListener('click', () => { moves = []; refresh(); });
    if (solved) {
      resultEl.hidden = false;
      resultEl.className = 'pz-result is-right';
      resultEl.textContent = t('puzzles.already_solved');
      $('pz-next').hidden = false;
    }
    renderAttempts();
    loadSolvers();
    loadHistory();
    requestAnimationFrame(() => { renderer.resize(); renderMoves(); drawBoard(); });
    window.addEventListener('resize', () => { renderer.resize(); drawBoard(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
