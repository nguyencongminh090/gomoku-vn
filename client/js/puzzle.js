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

  let puzzle = null;
  let renderer = null;
  let moves = [];        // solver's cells, in entry order
  let solved = false;
  let member = false;

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
    renderer.setState(window.PuzzleBoard.state(puzzle.boardSize, puzzle.stones, puzzle.toMove, moves, { interactive: !solved }));
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
    $('pz-submit').disabled = solved; // typed text is only parsed on submit, so it must stay clickable with no moves yet
  }

  function refresh() {
    resultEl.hidden = true;
    renderMoves();
    drawBoard();
  }

  /** Add one cell; final_move keeps a single cell, sequence appends (no duplicates, no stones). */
  function addMove(c) {
    if (solved) return;
    if (puzzle.stones.some((s) => s.x === c.x && s.y === c.y)) return;
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
    const occupied = (c) => puzzle.stones.some((s) => s.x === c.x && s.y === c.y);
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
        resultEl.textContent = apiError(data, t('puzzles.error'));
      } else if (data.correct) {
        solved = true;
        resultEl.className = 'pz-result is-right';
        resultEl.textContent = t('puzzles.correct');
        $('pz-next').hidden = false;
        refresh();
        resultEl.hidden = false;
      } else {
        resultEl.className = 'pz-result is-wrong';
        resultEl.textContent = t('puzzles.wrong');
      }
    } catch (err) {
      resultEl.hidden = false;
      resultEl.className = 'pz-result is-wrong';
      resultEl.textContent = t('puzzles.error');
    }
    renderMoves();
  }

  function renderInfo() {
    $('pz-title').textContent = puzzle.title;
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
    document.title = 'Play3CR — ' + puzzle.title;
    loginEl.textContent = t('puzzles.login_needed');
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
      const me = await fetch('/api/rankings/me', { credentials: 'same-origin' });
      member = me.ok;
    } catch (_) { member = false; }
    solved = !!puzzle.solved;

    viewEl.hidden = false;
    renderInfo();
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
    requestAnimationFrame(() => { renderer.resize(); renderMoves(); drawBoard(); });
    window.addEventListener('resize', () => { renderer.resize(); drawBoard(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
