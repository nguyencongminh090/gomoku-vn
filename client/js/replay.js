/**
 * replay.js — Replay viewer with tree analysis, at /replay/<gameId> (B202; was history.js).
 *
 * Features:
 *   - Replay viewer with step-through controls
 *   - Analysis mode: click board to add variations
 *   - Tree panel: visual move tree with click navigation
 *   - Shareable URL: /replay/<gameId> (?source=tournament for a tournament game)
 *   - Keyboard shortcuts
 *
 * The game list moved to the profile (B202); the global history is a separate site later.
 *
 * Reuses: BoardRenderer (board.js), MoveTree (move-tree.js), TreeView (tree-view.js)
 */

'use strict';

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const viewReplay   = document.getElementById('view-replay');

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
let boardRenderer = null;
let autoPlayTimer = null;

// Tree-based state
let moveTree = null;      // MoveTree instance
let treeView = null;      // TreeView instance
let analysisMode = false;
let replayGameData = null; // Raw game data for info display

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

    // Show the view FIRST (so parent has dimensions when we call resize)
    viewReplay.style.display = '';

    // Reset analysis mode. Default opens straight into it (analysis is the
    // reason a power user opens a replay at all); Lite starts closed but can
    // toggle it.
    setAnalysisMode(uiMode() === 'default');

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
  // A tournament-sourced replay (TODO.md #78) goes back to the tournament it came from.
  if (replayGameData && replayGameData.tournament_id) {
    window.location.href = `tournament.html?id=${encodeURIComponent(replayGameData.tournament_id)}`;
    return;
  }
  stopAutoPlay();
  // Back to wherever the viewer came from (usually a profile's game history); a direct visit (a new
  // tab, no history entry to return to) goes home. document.referrer is empty here (no-referrer policy).
  if (window.history.length > 1) window.history.back();
  else window.location.href = '/';
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

// Current UI mode — 'lite' | 'default'. Delegates to ui-mode.js so the
// 'pro' → 'default' normalisation lives in exactly one place.
function uiMode() {
  return (window.getUiMode && window.getUiMode()) || 'lite';
}

// Analysis is available in every UI mode; only the entry state differs
// (auto-opened in Default, closed in Lite) — see openReplay().

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
  
  btnPlay.innerHTML = '<svg class="icon"><use href="assets/icons/phosphor-sprite.svg?v=214#ph-bold-pause"></use></svg>';
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
  btnPlay.innerHTML = '<svg class="icon"><use href="assets/icons/phosphor-sprite.svg?v=214#ph-bold-play"></use></svg>';
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
// Utilities
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Lang change listener — re-render text this page builds outside data-i18n
// (result label, replay meta) without a re-fetch (TODO #45).
// ---------------------------------------------------------------------------
window.addEventListener('langchange', () => {
  if (replayGameData) renderReplayInfo(replayGameData);
});

// ---------------------------------------------------------------------------
// UI mode change listener — re-gate the replay view without a reload
// ---------------------------------------------------------------------------
window.addEventListener('uimodechange', () => {
  // Switching to Default mid-replay should switch straight into analysis.
  if (replayGameData) {
    if (uiMode() === 'default' && !analysisMode) setAnalysisMode(true);
    requestAnimationFrame(() => {
      if (boardRenderer) boardRenderer.resize();
      syncBoardToTree();
    });
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
// Site-wide Arena header (B193): the replay lives under the "Học" tab.
if (window.PlatformShell) window.PlatformShell.build('learn');
const urlGameId = decodeURIComponent((/^\/replay\/([^/?#]+)/.exec(window.location.pathname) || [])[1] || '');
if (urlGameId) {
  openReplay(urlGameId, new URLSearchParams(window.location.search).get('source') === 'tournament' ? 'tournament' : undefined);
} else {
  window.location.href = '/';
}
