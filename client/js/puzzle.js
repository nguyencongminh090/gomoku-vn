/**
 * puzzle.js — solve one puzzle (#203 7a-2), page /puzzle/<id>.
 *
 * GET /api/puzzles/:id (no answers) → static board. The solver enters ONLY their own moves, by
 * typing coordinates (`H8` letters or `122` sequence numbers, via Coords.parseList); the board is
 * view-only meanwhile (#507). POST /api/puzzles/:id/solve {moves} → {correct}. Once solved or out
 * of tries the board unlocks for free study (alternating stones, never submitted, #pz-reset). The answer never reaches
 * this page — the server compares. Guests can look but not check (the API is member-only).
 * BoardRenderer is used through setState/onCellClick only. The panel is three steps (#508): read → answer
 * (live) → explore (after the end); `position` from the API gives "puzzle N of M" and the next unsolved one.
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
  let study = [];          // free-study stones after the end (#507), {x, y, color}
  let attemptsUsed = null; // the member's tries so far (stat tile, #508)

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

  /** The board is a study board once the puzzle is over (solved, or no tries left); view-only before (#507). */
  const exploring = () => solved || attemptsLeft === 0;

  /** Solver's moves as stones in their colour, then the study stones. */
  function boardStones() {
    return puzzle.stones.concat(moves.map((m) => ({ x: m.x, y: m.y, color: puzzle.toMove })), study);
  }

  /** Next study colour from the counts (black first when even), like the editor's auto tool. */
  function studyColor() {
    const all = boardStones();
    const b = all.filter((s) => s.color === 'BLACK').length;
    return b > all.length - b ? 'WHITE' : 'BLACK';
  }

  function drawBoard() {
    if (!renderer) return;
    const open = exploring();
    const state = window.PuzzleBoard.state(puzzle.boardSize, boardStones(), puzzle.toMove, [], {
      interactive: open, walls: puzzle.walls, portals: puzzle.portals, myColor: open ? studyColor() : puzzle.toMove,
    });
    const last = study.length ? study[study.length - 1] : moves[moves.length - 1];
    state.lastMove = last ? { x: last.x, y: last.y } : null;
    renderer.setState(state);
    $('pz-reset').hidden = !open;
    $('pz-reset').disabled = !study.length && !moves.length;
    $('pz-explore-note').hidden = !open;
    renderSteps(open);
  }

  /** Step states: answer is live until the end, then done; explore opens (board unlock pulse once). */
  function renderSteps(open) {
    $('pz-step-answer').classList.toggle('is-on', !open);
    $('pz-step-answer').classList.toggle('is-done', open);
    $('pz-step-explore').classList.toggle('is-on', open);
    $('pz-form').hidden = open;
    $('pz-lock').hidden = open;
    $('pz-explore-locked').hidden = open;
    viewEl.classList.toggle('is-open', open);
  }

  function renderMoves() {
    movesEl.replaceChildren();
    if (!moves.length) {
      movesEl.appendChild(el('span', t('puzzles.no_moves'), 'pz-help'));
    }
    moves.forEach((m, i) => {
      movesEl.appendChild(el('span', (i + 1) + '. ' + window.Coords.label(m.x, m.y, puzzle.boardSize), 'pz-tag'));
    });
    inputEl.value = moves.map((m) => window.Coords.label(m.x, m.y, puzzle.boardSize)).join(', ');
    renderControls();
  }

  function renderControls() {
    $('pz-clear').disabled = exploring() || (!moves.length && !inputEl.value.trim());
    $('pz-submit').disabled = exploring(); // typed text is only parsed on submit, so it must stay clickable with no moves yet
  }

  function renderAttempts(info) {
    if (info) attemptsLeft = info.attemptsLeft === undefined ? null : info.attemptsLeft;
    if (info && typeof info.attemptsUsed === 'number') attemptsUsed = info.attemptsUsed;
    $('pz-stat-tries').hidden = !member || attemptsUsed === null;
    $('pz-tries-n').textContent = attemptsUsed === null ? '' : String(attemptsUsed);
    attemptsEl.hidden = !member || solved || attemptsLeft === null;
    if (!attemptsEl.hidden) attemptsEl.textContent = t(attemptsLeft ? 'puzzles.attempts_left' : 'puzzles.attempts_none', { n: attemptsLeft });
    renderControls();
    drawBoard(); // running out of tries unlocks the board
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
      $('pz-stat-solvers').hidden = false;
      $('pz-solvers-n').textContent = String(data.total);
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
      $('pz-history-list').replaceChildren(...data.attempts.map((a) => {
        // One chip per try: the moves, then the verdict as its own word (no "A · B" join, #508).
        const chip = el('span', a.moves.map((m) => window.Coords.label(m.x, m.y, puzzle.boardSize)).join(', ') + ' ', 'pz-tag ' + (a.correct ? 'pz-tag--ok' : 'pz-tag--rejected'));
        chip.appendChild(el('b', t(a.correct ? 'puzzles.attempt_right' : 'puzzles.attempt_wrong')));
        return chip;
      }));
    } catch (_) { /* optional panel */ }
  }

  function refresh() {
    resultEl.hidden = true;
    renderMoves();
    drawBoard();
  }

  /** Board click: ignored while the puzzle is live (answers are typed); after the end, a study stone (#507). */
  function onBoardClick(c) {
    if (!exploring()) return;
    const taken = boardStones().concat(puzzle.walls || [], ...(puzzle.portals || []).map((p) => [p.a, p.b]));
    if (taken.some((s) => s.x === c.x && s.y === c.y)) return;
    study = study.concat([{ x: c.x, y: c.y, color: studyColor() }]);
    drawBoard();
  }

  /** Study reset: back to the puzzle position (solver's moves and study stones off the board). */
  function resetBoard() {
    study = [];
    moves = [];
    renderMoves();
    drawBoard();
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
    if (exploring() || !applyTyped() || !moves.length) return;
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
        if (data.code === 'PUZZLE_ATTEMPTS_EXCEEDED') renderAttempts({ attemptsLeft: 0 }); // the server refused: no tries left, whatever the body says
        else if (data.attemptsLeft !== undefined) renderAttempts(data);
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
    const dot = el('span', undefined, 'pz-dot pz-dot--' + puzzle.toMove);
    dot.setAttribute('aria-hidden', 'true');
    $('pz-turn').replaceChildren(dot, document.createTextNode(t(puzzle.toMove === 'BLACK' ? 'puzzles.black_to_move' : 'puzzles.white_to_move')));
    $('pz-input-label').textContent = t(puzzle.mode === 'final_move' ? 'puzzles.enter_final' : 'puzzles.enter_sequence');
    const meta = $('pz-meta');
    // One fact per chip (#508): level, rule, size, topics; the author as plain text after them.
    meta.replaceChildren(
      el('span', t('puzzles.level_' + puzzle.level), 'pz-tag pz-tag--lv-' + puzzle.level),
      el('span', t('puzzles.rule_' + puzzle.rule), 'pz-tag'),
      el('span', puzzle.boardSize + '×' + puzzle.boardSize, 'pz-tag'),
    );
    for (const tg of puzzle.tags || []) meta.appendChild(el('span', t('puzzles.tag_' + tg), 'pz-tag'));
    if (puzzle.author) meta.appendChild(el('small', t('puzzles.by', { name: puzzle.author.displayName }), 'pz-help'));
    const pos = puzzle.position;
    $('pz-position').hidden = !pos;
    if (pos) $('pz-position').textContent = t('puzzles.position', { n: pos.index, m: pos.total, level: t('puzzles.level_' + puzzle.level) });
    if (pos && pos.nextId) {
      $('pz-next-link').href = '/puzzle/' + encodeURIComponent(pos.nextId);
      $('pz-next-link').textContent = t('puzzles.next');
    }
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
    attemptsUsed = typeof puzzle.attemptsUsed === 'number' ? puzzle.attemptsUsed : null;

    viewEl.hidden = false;
    renderInfo();
    if (!member && !solved) loginEl.hidden = false;
    renderer = new window.BoardRenderer($('pz-canvas'), {
      boardSize: puzzle.boardSize,
      clickMode: 'single',
      onCellClick: (x, y) => onBoardClick({ x, y }),
    });
    $('pz-form').addEventListener('submit', submit);
    $('pz-clear').addEventListener('click', () => { moves = []; refresh(); });
    $('pz-reset').addEventListener('click', resetBoard);
    inputEl.addEventListener('input', renderControls);
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
