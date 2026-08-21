/**
 * history.js — Game History & Replay Viewer with Tree Analysis.
 *
 * Features:
 *   - Paginated game list from /api/games
 *   - Replay viewer with step-through controls
 *   - Analysis mode: click board to add variations
 *   - Tree panel: visual move tree with click navigation
 *   - URL sharing via ?id=gameId
 *   - Keyboard shortcuts
 *
 * Reuses: BoardRenderer (board.js), MoveTree (move-tree.js), TreeView (tree-view.js)
 */

'use strict';

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const viewList     = document.getElementById('view-list');
const viewReplay   = document.getElementById('view-replay');
const gameListEl   = document.getElementById('game-list');
const gameTotalEl  = document.getElementById('game-total');
const paginationEl = document.getElementById('pagination');

// Search/filter elements
const searchForm   = document.getElementById('history-search');
const searchPlayer = document.getElementById('search-player');
const searchFrom   = document.getElementById('search-from');
const searchTo     = document.getElementById('search-to');
const searchResult = document.getElementById('search-result');
const searchReset  = document.getElementById('search-reset');
const statsEl      = document.getElementById('history-stats');
const statsTotalEl = document.getElementById('stats-total');
const statsWinEl   = document.getElementById('stats-win');
const statsDrawEl  = document.getElementById('stats-draw');
const statsByDateEl = document.getElementById('stats-by-date');

// Replay elements
const replayBlack   = document.getElementById('replay-black');
const replayWhite   = document.getElementById('replay-white');
const replayResult  = document.getElementById('replay-result');
const replayMeta    = document.getElementById('replay-meta');
const replayCanvas  = document.getElementById('replay-canvas');
const moveCounter   = document.getElementById('move-counter');
const btnFirst      = document.getElementById('btn-first');
const btnPrev       = document.getElementById('btn-prev');
const btnNext       = document.getElementById('btn-next');
const btnLast       = document.getElementById('btn-last');
const btnPlay       = document.getElementById('btn-play');
const btnBack       = document.getElementById('replay-back');
const btnAnalysis   = document.getElementById('btn-analysis');
const treePanel     = document.getElementById('tree-panel');
const treeContainer = document.getElementById('tree-container');
const btnDeleteBranch = document.getElementById('btn-delete-branch');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentPage = 1;
let boardRenderer = null;
let autoPlayTimer = null;
let currentFilters = {}; // { player?, from?, to?, result? } — read from the search form

// Tree-based state
let moveTree = null;      // MoveTree instance
let treeView = null;      // TreeView instance
let analysisMode = false;
let replayGameData = null; // Raw game data for info display

// Cached from the last successful loadGames() response, so a language switch
// can re-render translated text (table headers, result labels) without
// re-fetching from the server (TODO #45).
let lastGamesList = [];
let lastPagination = null;

// ---------------------------------------------------------------------------
// Build a query string from currentFilters + pagination
// ---------------------------------------------------------------------------
function buildFilterParams(extra = {}) {
  const params = new URLSearchParams(extra);
  if (currentFilters.player) params.set('player', currentFilters.player);
  if (currentFilters.from)   params.set('from', currentFilters.from);
  if (currentFilters.to)     params.set('to', currentFilters.to);
  if (currentFilters.result) params.set('result', currentFilters.result);
  return params;
}

// ---------------------------------------------------------------------------
// Load game list
// ---------------------------------------------------------------------------
async function loadGames(page = 1) {
  currentPage = page;
  try {
    const params = buildFilterParams({ page: String(page), limit: '15' });
    const res = await fetch(`/api/games?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      const msg = data.code ? t('err.' + data.code.toLowerCase()) : (data.error || t('history.load_error'));
      gameListEl.innerHTML = `<div class="game-list__empty">${t('history.err_prefix', { msg })}</div>`;
      return;
    }

    const { games, pagination } = data;
    lastGamesList = games;
    lastPagination = pagination;
    gameTotalEl.textContent = t('history.game_count', { n: pagination.total });

    if (games.length === 0) {
      gameListEl.innerHTML = `<div class="game-list__empty">${t('history.no_match')}</div>`;
      paginationEl.innerHTML = '';
    } else {
      renderGameTable(games);
      renderPagination(pagination);
    }

    loadStats();
  } catch {
    gameListEl.innerHTML = `<div class="game-list__empty">${t('history.network_error')}</div>`;
  }
}

// ---------------------------------------------------------------------------
// Load aggregate stats (count by date, count by result) for current filters
// ---------------------------------------------------------------------------
async function loadStats() {
  try {
    const params = buildFilterParams();
    const res = await fetch(`/api/games/stats?${params.toString()}`);
    if (!res.ok) { statsEl.style.display = 'none'; return; }

    const { byDate, byResult } = await res.json();

    statsTotalEl.textContent = byResult.total;
    statsWinEl.textContent = byResult.win;
    statsDrawEl.textContent = byResult.draw;

    statsByDateEl.innerHTML = byDate.slice(0, 14).map(row =>
      `<span class="history-stats__date-row"><span>${escapeHtml(row.date)}</span><span>${row.count}</span></span>`
    ).join('');

    statsEl.style.display = '';
  } catch {
    statsEl.style.display = 'none';
  }
}

function renderGameTable(games) {
  let html = `
    <table class="game-table">
      <thead>
        <tr>
          <th>${t('history.th_time')}</th>
          <th>${t('history.th_black')}</th>
          <th>${t('history.th_white')}</th>
          <th>${t('history.th_result')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const g of games) {
    const time = formatTime(g.ended_at || g.started_at);
    const resultText = getResultText(g);
    const resultClass = g.winner === 'draw' ? 'result-draw' : 'result-win';

    html += `
      <tr>
        <td style="font-size:12px; color:var(--c-ink-3);">${time}</td>
        <td><strong>${escapeHtml(g.black_player_name)}</strong></td>
        <td>${escapeHtml(g.white_player_name)}</td>
        <td><span class="${resultClass}">${resultText}</span></td>
        <td><button class="btn-replay" data-action="openReplay" data-arg="${escapeAttr(g.id)}" type="button">${t('history.btn_view')}</button></td>
      </tr>
    `;
  }

  html += '</tbody></table>';
  gameListEl.innerHTML = html;
}

function renderPagination(p) {
  if (p.totalPages <= 1) { paginationEl.innerHTML = ''; return; }

  let html = `<button ${p.page <= 1 ? 'disabled' : ''} data-action="loadGames" data-arg="${p.page - 1}" data-arg-type="number">‹</button>`;
  for (let i = 1; i <= p.totalPages; i++) {
    if (p.totalPages > 7 && Math.abs(i - p.page) > 2 && i !== 1 && i !== p.totalPages) {
      if (i === 2 || i === p.totalPages - 1) html += '<button disabled>…</button>';
      continue;
    }
    html += `<button class="${i === p.page ? 'active' : ''}" data-action="loadGames" data-arg="${i}" data-arg-type="number">${i}</button>`;
  }
  html += `<button ${p.page >= p.totalPages ? 'disabled' : ''} data-action="loadGames" data-arg="${p.page + 1}" data-arg-type="number">›</button>`;
  paginationEl.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Replay viewer
// ---------------------------------------------------------------------------
function renderReplayInfo(game) {
  replayBlack.textContent = `✕ ${game.black_player_name}`;
  replayWhite.textContent = `○ ${game.white_player_name}`;
  replayResult.textContent = getResultTextFull(game);

  const rules = [];
  if (game.rule_wall) rules.push('Wall');
  if (game.rule_portal) rules.push('Portal');
  const ruleStr = rules.length > 0 ? rules.join(' + ') : t('lobby.rule_basic');
  replayMeta.textContent = `${game.board_size}×${game.board_size} | ${ruleStr} | ${formatTime(game.ended_at)}`;
}

// `source` — 'tournament' fetches a tournament game (TODO.md #78, separate
// from the casual `games` table) instead of a casual one; same response
// shape either way (GET /api/tournament-games/:id mirrors GET /api/games/:id)
// so everything below this point needs no branching.
async function openReplay(gameId, source) {
  try {
    const endpoint = source === 'tournament' ? `/api/tournament-games/${gameId}` : `/api/games/${gameId}`;
    const res = await fetch(endpoint);
    const data = await res.json();

    if (!res.ok || !data.game) {
      alert(data.code ? t('err.' + data.code.toLowerCase()) : (data.error || t('history.err_load_game')));
      return;
    }

    const game = data.game;
    replayGameData = game;

    // Build MoveTree from the flat move history
    moveTree = MoveTree.fromMoveHistory(game.moves || [], {
      boardSize: game.board_size,
      walls: game.walls || [],
      portals: game.portals || [],
    });

    // Fill info
    renderReplayInfo(game);

    // Switch view FIRST (so parent has dimensions when we call resize)
    viewList.style.display = 'none';
    viewReplay.style.display = '';

    // Update URL for sharing
    history.replaceState(null, '', source === 'tournament'
      ? `history.html?id=${gameId}&source=tournament`
      : `history.html?id=${gameId}`);

    // Reset analysis mode. Pro opens straight into it (analysis is the reason a
    // power user opens a replay at all); Lite/Default start closed but can toggle it.
    applyReplayMode();
    setAnalysisMode(uiMode() === 'pro');

    // Init board renderer (once)
    if (!boardRenderer) {
      boardRenderer = new BoardRenderer(replayCanvas, {
        boardSize: game.board_size,
        onCellClick: handleBoardClick,
      });
    }
    boardRenderer.boardSize = game.board_size;
    boardRenderer.interactive = false;

    // Init tree view (once)
    if (!treeView) {
      treeView = new TreeView(treeContainer, {
        onNodeClick: handleTreeNodeClick,
      });
    }

    // Let the DOM settle, then resize and render
    requestAnimationFrame(() => {
      boardRenderer.resize();
      syncBoardToTree();
    });
  } catch (err) {
    alert(t('history.err_load_game_generic'));
  }
}

function closeReplay() {
  // A tournament-sourced replay (TODO.md #78) has no casual list to go back
  // to — "back" means the tournament it came from, not history.html's list.
  if (replayGameData && replayGameData.tournament_id) {
    window.location.href = `tournament.html?id=${encodeURIComponent(replayGameData.tournament_id)}`;
    return;
  }
  stopAutoPlay();
  setAnalysisMode(false);
  viewReplay.style.display = 'none';
  viewList.style.display = '';
  moveTree = null;
  replayGameData = null;
  history.replaceState(null, '', 'history.html');
}

// ---------------------------------------------------------------------------
// Sync board display to current MoveTree position
// ---------------------------------------------------------------------------
function syncBoardToTree() {
  if (!moveTree || !boardRenderer) return;

  const { board, lastMove } = moveTree.getBoardState();
  const path = moveTree.getPath();
  const totalMainLine = countMainLine(moveTree.root);

  boardRenderer.setState({
    boardSize: moveTree.boardSize,
    board,
    walls: moveTree.walls,
    portals: moveTree.portals,
    lastMove,
    winLine: null,
    firstMoveZones: [],
    showZones: false,
    interactive: analysisMode,
    isMyTurn: analysisMode,
    myColor: analysisMode ? moveTree.getNextColor().toLowerCase() : null,
  });

  // Update counter
  moveCounter.textContent = `${path.length} / ${totalMainLine}`;

  // Update tree view
  if (treeView && treePanel.style.display !== 'none') {
    treeView.setTree(moveTree);
  }
}

/** Count total moves in the main line (following children[0]). */
function countMainLine(node) {
  let count = 0;
  let cur = node;
  while (cur.children.length > 0) {
    cur = cur.children[0];
    count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Analysis Mode
// ---------------------------------------------------------------------------

// Current UI mode — 'lite' | 'default' | 'pro' (see client/js/ui-mode.js)
function uiMode() {
  return document.documentElement.getAttribute('data-ui-mode') || 'lite';
}

// Analysis is available in every UI mode; only the default entry state
// (auto-opened in Pro, closed otherwise) differs — see openReplay().
function applyReplayMode() {
  if (btnAnalysis) btnAnalysis.style.display = '';
}

function setAnalysisMode(on) {
  analysisMode = on;
  btnAnalysis.classList.toggle('active', on);
  treePanel.style.display = on ? '' : 'none';

  if (boardRenderer) {
    boardRenderer.interactive = on;
    boardRenderer.isMyTurn = on;
    if (on && moveTree) {
      boardRenderer.myColor = moveTree.getNextColor().toLowerCase();
    }
  }

  // Re-render tree when entering analysis mode
  if (on && treeView && moveTree) {
    treeView.setTree(moveTree);
  }
}

function toggleAnalysis() {
  setAnalysisMode(!analysisMode);
  // Let the DOM settle (tree panel show/hide), then resize board
  requestAnimationFrame(() => {
    if (boardRenderer) boardRenderer.resize();
    syncBoardToTree();
  });
}

// ---------------------------------------------------------------------------
// Board click handler (analysis mode)
// ---------------------------------------------------------------------------
function handleBoardClick(x, y) {
  if (!analysisMode || !moveTree) return;

  // Check if cell is available
  if (!moveTree.isCellAvailable(x, y)) return;

  const color = moveTree.getNextColor();
  moveTree.addMove(x, y, color);
  syncBoardToTree();
}

// ---------------------------------------------------------------------------
// Tree node click handler
// ---------------------------------------------------------------------------
function handleTreeNodeClick(node) {
  if (!moveTree) return;
  moveTree.goToNode(node);
  syncBoardToTree();
}

// ---------------------------------------------------------------------------
// Navigation controls
// ---------------------------------------------------------------------------
function goFirst() {
  if (!moveTree) return;
  moveTree.goToStart();
  syncBoardToTree();
}

function goPrev() {
  if (!moveTree) return;
  moveTree.goBack();
  syncBoardToTree();
}

function goNext() {
  if (!moveTree) return;
  moveTree.goForward();
  syncBoardToTree();
}

function goLast() {
  if (!moveTree) return;
  moveTree.goToEnd();
  syncBoardToTree();
}

function toggleAutoPlay() {
  if (autoPlayTimer) stopAutoPlay();
  else startAutoPlay();
}

function startAutoPlay() {
  if (!moveTree) return;
  if (moveTree.currentNode.isLeaf) moveTree.goToStart();
  
  btnPlay.innerHTML = '<svg class="icon"><use href="assets/icons/phosphor-sprite.svg?v=138#ph-bold-pause"></use></svg>';
  btnPlay.classList.add('playing');
  autoPlayTimer = setInterval(() => {
    if (!moveTree.goForward()) {
      stopAutoPlay();
      return;
    }
    syncBoardToTree();
  }, 600);
}

function stopAutoPlay() {
  if (autoPlayTimer) { clearInterval(autoPlayTimer); autoPlayTimer = null; }
  btnPlay.innerHTML = '<svg class="icon"><use href="assets/icons/phosphor-sprite.svg?v=138#ph-bold-play"></use></svg>';
  btnPlay.classList.remove('playing');
}

// ---------------------------------------------------------------------------
// Delete current branch
// ---------------------------------------------------------------------------
function deleteBranch() {
  if (!moveTree || !moveTree.currentNode || moveTree.currentNode.isRoot) return;
  if (!confirm(t('history.confirm_delete_branch'))) return;
  moveTree.deleteNode(moveTree.currentNode);
  syncBoardToTree();
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
btnFirst.addEventListener('click', () => { stopAutoPlay(); goFirst(); });
btnPrev.addEventListener('click',  () => { stopAutoPlay(); goPrev(); });
btnNext.addEventListener('click',  () => { stopAutoPlay(); goNext(); });
btnLast.addEventListener('click',  () => { stopAutoPlay(); goLast(); });
btnPlay.addEventListener('click',  toggleAutoPlay);
btnBack.addEventListener('click',  closeReplay);
btnAnalysis.addEventListener('click', toggleAnalysis);
if (btnDeleteBranch) btnDeleteBranch.addEventListener('click', deleteBranch);

// Re-fit the board when the viewport/window changes (browser resize, device
// rotation, DevTools panel toggling) — board.js only recomputes size when
// resize() is called explicitly, so this must be wired up like game-ui.js does.
window.addEventListener('resize', () => {
  if (!boardRenderer || viewReplay.style.display === 'none') return;
  boardRenderer.resize();
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (!moveTree || viewReplay.style.display === 'none') return;
  // Don't capture if typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.key) {
    case 'ArrowLeft':  stopAutoPlay(); goPrev(); e.preventDefault(); break;
    case 'ArrowRight': stopAutoPlay(); goNext(); e.preventDefault(); break;
    case 'Home':       stopAutoPlay(); goFirst(); e.preventDefault(); break;
    case 'End':        stopAutoPlay(); goLast(); e.preventDefault(); break;
    case ' ':          e.preventDefault(); toggleAutoPlay(); break;
    case 'Escape':     closeReplay(); break;
    case 'a': case 'A': toggleAnalysis(); break;
    case 'Delete':     if (analysisMode) deleteBranch(); break;
  }
});

// ---------------------------------------------------------------------------
// Search form
// ---------------------------------------------------------------------------
searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  currentFilters = {
    player: searchPlayer.value.trim(),
    from:   searchFrom.value,
    to:     searchTo.value,
    result: searchResult.value,
  };
  loadGames(1);
});

searchReset.addEventListener('click', () => {
  searchForm.reset();
  currentFilters = {};
  loadGames(1);
});

// Expose for inline onclick
window.openReplay = openReplay;
window.loadGames  = loadGames;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function getResultText(g) {
  if (!g.winner || g.winner === 'draw') return t('history.result_draw');
  return g.winner_name ? t('history.x_won', { name: g.winner_name }) : t('history.someone_won');
}

function getResultTextFull(g) {
  const reasonMap = {
    normal: t('history.reason_normal'),
    resign: t('game.btn_resign'),
    timeout: t('history.reason_timeout'),
    draw_agreement: t('history.reason_draw_agreement'),
    board_full: t('history.reason_board_full'),
  };

  if (!g.winner || g.winner === 'draw') {
    return t('history.draw_with_reason', { reason: reasonMap[g.reason] || g.reason || '' });
  }

  const name = g.winner_name || t('history.player_generic');
  const reason = reasonMap[g.reason] || g.reason || '';
  return t('history.x_won', { name }) + (reason ? ' — ' + reason : '');
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  try {
    const d = new Date(typeof isoStr === 'number' ? isoStr : isoStr);
    if (isNaN(d.getTime())) return '—';
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

const escapeAttr = (str) => globalThis.EscapeUtils.escapeAttr(str);

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Lang change listener — re-render text this page builds outside data-i18n
// (table headers, result labels, replay meta) without a re-fetch (TODO #45).
// ---------------------------------------------------------------------------
window.addEventListener('langchange', () => {
  if (viewReplay.style.display !== 'none' && replayGameData) {
    renderReplayInfo(replayGameData);
  } else if (lastGamesList.length > 0) {
    renderGameTable(lastGamesList);
    if (lastPagination) {
      gameTotalEl.textContent = t('history.game_count', { n: lastPagination.total });
      renderPagination(lastPagination);
    }
  }
});

// ---------------------------------------------------------------------------
// UI mode change listener — re-gate the replay view without a reload
// ---------------------------------------------------------------------------
window.addEventListener('uimodechange', () => {
  applyReplayMode();
  // Pro entering mid-replay should switch straight into analysis.
  if (replayGameData) {
    const mode = uiMode();
    if (mode === 'pro' && !analysisMode) setAnalysisMode(true);
    requestAnimationFrame(() => {
      if (boardRenderer) boardRenderer.resize();
      syncBoardToTree();
    });
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
applyReplayMode();

const urlParams = new URLSearchParams(window.location.search);
const urlGameId = urlParams.get('id');
const urlSource = urlParams.get('source');
if (urlGameId && urlSource === 'tournament') {
  // No casual list to show for a tournament-sourced deep link (TODO.md #78).
  openReplay(urlGameId, 'tournament');
} else if (urlGameId) {
  loadGames(1);
  openReplay(urlGameId);
} else {
  loadGames(1);
}
