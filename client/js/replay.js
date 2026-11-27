/**
 * replay.js — Replay viewer at /replay/<gameId> (B202; was history.js). Layout: #502 (mockup A).
 *
 *   - board | panel: players, result + meta chips, timeline slider, transport dock, speed, share,
 *     analysis switch, numbered move list with think times and inline variations, delete branch, report
 *   - analysis mode: click the board to add variations (MoveTree); variations show inline in the list
 *   - deep link ?move=N (main-line ply, 0 = empty board), kept in sync with history.replaceState;
 *     ?source=tournament fetches a tournament game and goes back to the tournament
 *   - keys: ← → Home End Space Esc A Delete
 *
 * Reuses: BoardRenderer (board.js), MoveTree (move-tree.js), ReplayCore (replay-core.js).
 */

'use strict';

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const viewReplay   = document.getElementById('view-replay');
const replayBlack  = document.getElementById('replay-black');
const replayWhite  = document.getElementById('replay-white');
const replayResult = document.getElementById('replay-result');
const replayMeta   = document.getElementById('replay-meta');
const replayCanvas = document.getElementById('replay-canvas');
const moveCounter  = document.getElementById('move-counter');
const slider       = document.getElementById('rp-slider');
const ticks        = document.getElementById('rp-ticks');
const btnFirst     = document.getElementById('btn-first');
const btnPrev      = document.getElementById('btn-prev');
const btnNext      = document.getElementById('btn-next');
const btnLast      = document.getElementById('btn-last');
const btnPlay      = document.getElementById('btn-play');
const btnBack      = document.getElementById('replay-back');
const btnAnalysis  = document.getElementById('btn-analysis');
const btnShare     = document.getElementById('rp-share');
const btnDeleteBranch = document.getElementById('btn-delete-branch');
const speedGroup   = document.getElementById('rp-speed');
const moveList     = document.getElementById('rp-moves');
const moveStrip    = document.getElementById('rp-strip');
const errorNote    = document.getElementById('rp-error');
const toast        = document.getElementById('rp-toast');

const SPRITE = 'assets/icons/phosphor-sprite.svg?v=1d6d0a18';
const icon = (id) => `<svg class="icon" aria-hidden="true"><use href="${SPRITE}#ph-regular-${id}"></use></svg>`;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let boardRenderer = null;
let autoPlayTimer = null;
let moveTree = null;       // MoveTree instance
let mainLine = [];         // the game's own moves, frozen at load (analysis adds never extend it)
let mainPly = new Map();   // node → main-line ply (1-based)
let times = { has: false, think: [] };
let analysisMode = false;
let replayGameData = null; // raw game data for info display
let replaySource;          // 'tournament' | undefined
let replayGameId = '';
let toastTimer = null;

// Page-level listeners hang off one controller so a test can boot the page twice.
const pageAbort = new AbortController();
const on = (target, type, fn, opts) => target.addEventListener(type, fn, { ...(opts || {}), signal: pageAbort.signal });

// ---------------------------------------------------------------------------
// Info: players, result, meta chips
// ---------------------------------------------------------------------------
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/**
 * One seat: a member shows the shared avatar (PlatformShell.avatar) with the seat stone as a badge,
 * a profile link and the rating they had in this game (#500); a guest / deleted account keeps the stone.
 */
function renderPlayer(host, name, seat, winnerSeat, info) {
  const label = name || t('history.player_generic');
  const stone = el('span', 'rp-stone rp-stone--' + (seat === 'BLACK' ? 'x' : 'o'), seat === 'BLACK' ? '✕' : '○');
  stone.setAttribute('aria-hidden', 'true');
  const shell = window.PlatformShell;
  if (info && info.username && shell && typeof shell.avatar === 'function') {
    const av = el('span', 'rp-av');
    stone.classList.add('rp-stone--badge');
    av.append(shell.avatar(info.avatarUrl, label, 'pav--rp'), stone);
    const link = el('a', 'rp-name', label);
    link.href = '/profile/' + encodeURIComponent(info.username);
    host.replaceChildren(av, link);
    if (info.rating != null) {
      const r = el('span', 'rp-rating', String(info.rating));
      r.title = t('replay.rating_at_game');
      host.append(r);
    }
  } else {
    host.replaceChildren(stone, el('span', 'rp-name', label));
  }
  if (winnerSeat === seat) {
    const win = el('span', 'rp-win');
    win.innerHTML = icon('trophy');
    win.append(el('span', 'rp-win__t', t('replay.won')));
    host.append(win);
  }
}

const RULE_KEYS = ['freestyle', 'standard', 'caro', 'renju'];

function chip(text, iconId, title) {
  const c = el('span', 'rp-chip');
  if (iconId) c.innerHTML = icon(iconId);
  c.append(text);
  if (title) c.title = title;
  return c;
}

function renderReplayInfo(game) {
  const winnerSeat = game.winner === 'BLACK' || game.winner === 'WHITE' ? game.winner : null;
  const seats = game.seats || {};
  renderPlayer(replayBlack, game.black_player_name, 'BLACK', winnerSeat, seats.black);
  renderPlayer(replayWhite, game.white_player_name, 'WHITE', winnerSeat, seats.white);
  replayResult.textContent = getResultTextFull(game);

  const chips = [chip(`${game.board_size}×${game.board_size}`)];
  if (game.rule_wall) chips.push(chip(t('room.rule_wall')));
  if (game.rule_portal) chips.push(chip(t('room.rule_portal')));
  if (!game.rule_wall && !game.rule_portal) chips.push(chip(t('lobby.rule_basic')));
  // Winning rule (#501); legacy games have none stored and get no chip.
  if (RULE_KEYS.includes(game.winning_rule)) chips.push(chip(t('rule.' + game.winning_rule), null, t('replay.winning_rule')));
  chips.push(chip(t('replay.n_moves', { n: mainLine.length })));
  const dur = ReplayCore.durationMs(game);
  if (times.has && dur != null) chips.push(chip(ReplayCore.formatClock(dur), 'timer', t('replay.duration')));
  chips.push(chip(formatTime(game.ended_at)));
  replayMeta.replaceChildren(...chips);
}

// ---------------------------------------------------------------------------
// Load / close
// ---------------------------------------------------------------------------
function showLoadError(msg) {
  viewReplay.classList.add('rp--error');
  errorNote.textContent = msg;
  errorNote.hidden = false;
}

// `source` — 'tournament' fetches a tournament game (TODO.md #78, separate from the casual `games` table);
// GET /api/tournament-games/:id mirrors GET /api/games/:id, so nothing below branches on it.
async function openReplay(gameId, source) {
  replayGameId = gameId;
  replaySource = source;
  let data;
  let res;
  try {
    const endpoint = source === 'tournament' ? `/api/tournament-games/${encodeURIComponent(gameId)}` : `/api/games/${encodeURIComponent(gameId)}`;
    res = await fetch(endpoint);
    data = await res.json();
  } catch (err) {
    showLoadError(t('history.err_load_game_generic'));
    return;
  }
  if (!res.ok || !data || !data.game) {
    showLoadError(data && data.code ? t('err.' + data.code.toLowerCase()) : ((data && data.error) || t('history.err_load_game')));
    return;
  }

  const game = data.game;
  replayGameData = game;
  const moves = Array.isArray(game.moves) ? game.moves : [];
  moveTree = MoveTree.fromMoveHistory(moves, {
    boardSize: game.board_size,
    walls: game.walls || [],
    portals: game.portals || [],
  });
  mainLine = [];
  for (let n = moveTree.root; n.children.length; ) { n = n.children[0]; mainLine.push(n); }
  mainPly = new Map(mainLine.map((n, i) => [n, i + 1]));
  times = ReplayCore.moveTimes(moves);

  renderReplayInfo(game);
  slider.max = String(mainLine.length);

  const start = ReplayCore.parseMoveParam(window.location.search, mainLine.length);
  if (start) moveTree.goToNode(mainLine[start - 1]);

  if (!boardRenderer) {
    boardRenderer = new BoardRenderer(replayCanvas, { boardSize: game.board_size, onCellClick: handleBoardClick });
  }
  boardRenderer.boardSize = game.board_size;
  setAnalysisMode(loadAnalysisPref()); // however the user left it last time (#253)

  // Let the layout settle, then fit the board and render.
  requestAnimationFrame(() => {
    boardRenderer.resize();
    syncBoardToTree();
  });
  syncBoardToTree();
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
// Position helpers
// ---------------------------------------------------------------------------
const cur = () => moveTree.currentNode;

/** Main-line ply of the node, or of the main-line move its variation branches from. */
function anchorPly(node) {
  for (let n = node; n; n = n.parent) {
    if (n.isRoot) return 0;
    if (mainPly.has(n)) return mainPly.get(n);
  }
  return 0;
}

function goToPly(ply) {
  moveTree.goToNode(ply > 0 ? mainLine[ply - 1] : moveTree.root);
}

function findNode(id) {
  const stack = [moveTree.root];
  while (stack.length) {
    const n = stack.pop();
    if (String(n.id) === String(id)) return n;
    stack.push(...n.children);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Render: board, timeline, counter, list, strip, URL
// ---------------------------------------------------------------------------
function syncBoardToTree() {
  if (!moveTree || !boardRenderer) return;
  const node = cur();
  const { board, lastMove } = moveTree.getBoardState();

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

  const total = mainLine.length;
  const depth = node.depth;
  const ply = anchorPly(node);
  slider.value = String(ply);
  slider.style.setProperty('--pct', (total ? (ply / total) * 100 : 0) + '%');
  slider.setAttribute('aria-valuetext', t('replay.move_of', { n: depth, total }));
  moveCounter.innerHTML = `<b>${depth}</b><span>/ ${total}</span>`;

  renderTicks();
  renderMoveList();
  renderStrip();
  btnDeleteBranch.disabled = !isVariationNode(node);
  syncUrl(ply);
}

function isVariationNode(node) {
  return !!node && !node.isRoot && !mainPly.has(node);
}

function renderTicks() {
  const total = mainLine.length;
  ticks.replaceChildren();
  if (!total) return;
  [moveTree.root, ...mainLine].forEach((n, i) => {
    if (n.children.length < 2) return;
    const dot = document.createElement('i');
    dot.style.setProperty('left', (i / total) * 100 + '%');
    ticks.append(dot);
  });
}

function moveLabel(n) { return n.shortLabel; }

function moveCell(n, ply) {
  const isCur = n === cur();
  const tm = times.has ? times.think[ply - 1] : undefined;
  const time = times.has ? `<span class="rp-mv__t">${tm == null ? '—' : ReplayCore.formatClock(tm)}</span>` : '';
  return `<button type="button" class="rp-mv${isCur ? ' is-cur' : ''}" data-id="${n.id}"${isCur ? ' aria-current="step"' : ''}><span class="rp-mv__c">${moveLabel(n)}</span>${time}</button>`;
}

/** A variation as inline moves "30… K7 31. L8 …"; sub-variations nest in parentheses. */
function variationLine(start) {
  let h = '';
  for (let k = start; k; k = k.children[0]) {
    const isCur = k === cur();
    const no = k.depth + (k.move.color === 'WHITE' && k === start ? '…' : '.');
    h += `<button type="button" class="rp-vmv${isCur ? ' is-cur' : ''}" data-id="${k.id}"${isCur ? ' aria-current="step"' : ''}>${no} ${moveLabel(k)}</button>`;
    for (const sub of k.children.slice(1)) h += `(${variationLine(sub)})`;
  }
  return h;
}

function variationsOf(n) {
  return n.children.slice(1).map((v) => `<div class="rp-var" role="group" aria-label="${t('replay.variation')}">${icon('git-branch')}${variationLine(v)}</div>`).join('');
}

function renderMoveList() {
  let h = '';
  const leaf = mainLine.length ? mainLine[mainLine.length - 1] : moveTree.root;
  h += variationsOf(moveTree.root);
  for (let i = 0; i < mainLine.length; i += 2) {
    const b = mainLine[i];
    const w = mainLine[i + 1];
    h += `<div class="rp-row"><span class="rp-no">${i / 2 + 1}</span>${moveCell(b, i + 1)}${w ? moveCell(w, i + 2) : '<span></span>'}</div>`;
    h += variationsOf(b);
    if (w) h += variationsOf(w);
  }
  // Analysis moves played after the game's last move sit in its children[0]: show them as a variation too.
  if (leaf !== moveTree.root && leaf.children.length) {
    h += `<div class="rp-var" role="group" aria-label="${t('replay.variation')}">${icon('git-branch')}${variationLine(leaf.children[0])}</div>`;
  }
  moveList.innerHTML = h;
  keepInView(moveList, moveList.querySelector('.is-cur'), false);
}

function renderStrip() {
  moveStrip.innerHTML = mainLine.map((n, i) => {
    const isCur = n === cur();
    return `<button type="button" class="rp-chipmv${isCur ? ' is-cur' : ''}" data-id="${n.id}"${isCur ? ' aria-current="step"' : ''}><b>${i + 1}</b>${moveLabel(n)}</button>`;
  }).join('');
  keepInView(moveStrip, moveStrip.querySelector('.is-cur'), true);
}

/** Scroll only the list box (scrollIntoView would also scroll the page on phones). */
function keepInView(box, item, horizontal) {
  if (!box || !item || typeof item.getBoundingClientRect !== 'function') return;
  const b = box.getBoundingClientRect();
  const r = item.getBoundingClientRect();
  if (horizontal) {
    if (box.scrollWidth > box.clientWidth) box.scrollLeft += r.left - b.left - (b.width - r.width) / 2;
  } else if (box.scrollHeight > box.clientHeight) {
    if (r.top < b.top) box.scrollTop -= b.top - r.top + 8;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
  }
}

function syncUrl(ply) {
  const params = new URLSearchParams(window.location.search);
  if (ply > 0) params.set('move', String(ply)); else params.delete('move');
  const q = params.toString();
  const next = window.location.pathname + (q ? '?' + q : '') + window.location.hash;
  if (next !== window.location.pathname + window.location.search + window.location.hash) {
    try { window.history.replaceState(window.history.state, '', next); } catch (e) { /* sandboxed */ }
  }
}

// ---------------------------------------------------------------------------
// Analysis mode
// ---------------------------------------------------------------------------
// Whether replays open straight into analysis is remembered from the last toggle.
const ANALYSIS_PREF_KEY = 'gvn_replay_analysis';

function loadAnalysisPref() {
  try { return localStorage.getItem(ANALYSIS_PREF_KEY) === '1'; } catch (e) { return false; }
}

function saveAnalysisPref(isOn) {
  try { localStorage.setItem(ANALYSIS_PREF_KEY, isOn ? '1' : '0'); } catch (e) { /* private mode */ }
}

function setAnalysisMode(isOn) {
  analysisMode = isOn;
  btnAnalysis.setAttribute('aria-checked', String(isOn));
  if (boardRenderer) {
    boardRenderer.interactive = isOn;
    boardRenderer.isMyTurn = isOn;
    if (isOn && moveTree) boardRenderer.myColor = moveTree.getNextColor().toLowerCase();
  }
}

function toggleAnalysis() {
  setAnalysisMode(!analysisMode);
  saveAnalysisPref(analysisMode);
  syncBoardToTree();
}

function handleBoardClick(x, y) {
  if (!analysisMode || !moveTree) return;
  if (!moveTree.isCellAvailable(x, y)) return;
  stopAutoPlay();
  moveTree.addMove(x, y, moveTree.getNextColor());
  syncBoardToTree();
}

/** Delete the variation on the board. The game's own moves can't be deleted. */
function deleteBranch() {
  if (!moveTree || !isVariationNode(cur())) return;
  if (!confirm(t('history.confirm_delete_branch'))) return;
  moveTree.deleteNode(cur());
  syncBoardToTree();
}

// ---------------------------------------------------------------------------
// Navigation + playback
// ---------------------------------------------------------------------------
function nav(fn) {
  if (!moveTree) return;
  stopAutoPlay();
  fn();
  syncBoardToTree();
}
const goFirst = () => nav(() => moveTree.goToStart());
const goPrev  = () => nav(() => moveTree.goBack());
const goNext  = () => nav(() => moveTree.goForward());
const goLast  = () => nav(() => moveTree.goToEnd());

const SPEED_KEY = 'gvn_replay_speed';
const SPEEDS = [1200, 600, 300];
let speedMs = 600;

function loadSpeed() {
  try { const v = Number(localStorage.getItem(SPEED_KEY)); return SPEEDS.includes(v) ? v : 600; } catch (e) { return 600; }
}

function setSpeed(ms, save) {
  speedMs = SPEEDS.includes(ms) ? ms : 600;
  const opts = [...speedGroup.querySelectorAll('[data-speed]')];
  opts.forEach((o) => {
    const isOn = Number(o.dataset.speed) === speedMs;
    o.classList.toggle('is-active', isOn);
    o.setAttribute('aria-pressed', String(isOn));
  });
  speedGroup.style.setProperty('--i', String(SPEEDS.indexOf(speedMs)));
  if (save) { try { localStorage.setItem(SPEED_KEY, String(speedMs)); } catch (e) { /* private mode */ } }
  if (autoPlayTimer) { stopAutoPlay(); startAutoPlay(); }
}

function renderPlayButton() {
  const playing = !!autoPlayTimer;
  btnPlay.innerHTML = icon(playing ? 'pause' : 'play');
  btnPlay.setAttribute('aria-label', t(playing ? 'replay.pause' : 'replay.play'));
  btnPlay.setAttribute('aria-pressed', String(playing));
}

function toggleAutoPlay() {
  if (autoPlayTimer) stopAutoPlay();
  else startAutoPlay();
}

function startAutoPlay() {
  if (!moveTree) return;
  if (cur().isLeaf) { moveTree.goToStart(); syncBoardToTree(); }
  autoPlayTimer = setInterval(() => {
    if (!moveTree.goForward()) { stopAutoPlay(); return; }
    syncBoardToTree();
  }, speedMs);
  renderPlayButton();
}

function stopAutoPlay() {
  if (autoPlayTimer) { clearInterval(autoPlayTimer); autoPlayTimer = null; }
  renderPlayButton();
}

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------
function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
}

/** Copies a link to the main-line move on the board (its branch point on a variation); move 0 → the game. */
async function shareLink() {
  if (!moveTree) return;
  const ply = anchorPly(cur());
  const url = ReplayCore.buildShareUrl(window.location.origin, replayGameId, { source: replaySource, move: ply });
  const done = ply > 0 ? t('replay.copied_move', { n: ply }) : t('replay.copied_start');
  try {
    if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard');
    await navigator.clipboard.writeText(url);
    showToast(done);
  } catch (e) {
    // Plain http (LAN / dev route) has no clipboard API: show the link to copy by hand.
    showToast(t('replay.copy_manual', { url }));
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------
on(btnFirst, 'click', goFirst);
on(btnPrev, 'click', goPrev);
on(btnNext, 'click', goNext);
on(btnLast, 'click', goLast);
on(btnPlay, 'click', toggleAutoPlay);
on(btnBack, 'click', closeReplay);
on(btnAnalysis, 'click', toggleAnalysis);
on(btnDeleteBranch, 'click', deleteBranch);
on(btnShare, 'click', shareLink);
on(speedGroup, 'click', (e) => {
  const b = e.target.closest('[data-speed]');
  if (b) setSpeed(Number(b.dataset.speed), true);
});
on(slider, 'input', () => nav(() => goToPly(Number(slider.value))));
const onPick = (e) => {
  const b = e.target.closest('[data-id]');
  if (!b || !moveTree) return;
  const n = findNode(b.dataset.id);
  if (n) nav(() => moveTree.goToNode(n));
};
on(moveList, 'click', onPick);
on(moveStrip, 'click', onPick);

// Re-fit the board when the viewport changes; board.js only re-measures on resize().
on(window, 'resize', () => { if (boardRenderer) boardRenderer.resize(); });

// Keyboard shortcuts
on(document, 'keydown', (e) => {
  // A focused board (analysis) already used the key for its own cursor: board.js prevented it.
  if (!moveTree || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
  if (tag === 'INPUT' && e.target.type !== 'range') return;
  // Space / Enter on a focused button already click it; don't toggle twice.
  if ((e.key === ' ' || e.key === 'Enter') && (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY')) return;

  switch (e.key) {
    case 'ArrowLeft':  e.preventDefault(); goPrev(); break;
    case 'ArrowRight': e.preventDefault(); goNext(); break;
    case 'Home':       e.preventDefault(); goFirst(); break;
    case 'End':        e.preventDefault(); goLast(); break;
    case ' ':          e.preventDefault(); toggleAutoPlay(); break;
    case 'Escape':     closeReplay(); break;
    case 'a': case 'A': toggleAnalysis(); break;
    case 'Delete':     if (analysisMode) deleteBranch(); break;
    default: break;
  }
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function getResultTextFull(g) {
  // #471: GameEngine writes 'win' (five in a row) and 'agreement' (draw); older names kept for legacy rows.
  const reasonMap = {
    win: t('history.reason_normal'),
    agreement: t('history.reason_draw_agreement'),
    normal: t('history.reason_normal'),
    resign: t('game.btn_resign'),
    timeout: t('history.reason_timeout'),
    draw_agreement: t('history.reason_draw_agreement'),
    board_full: t('history.reason_board_full'),
    abandon: t('history.reason_abandon'), // #493 rated game left past its absence budget
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
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '—';
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

// ---------------------------------------------------------------------------
// Lang change — re-render text this page builds outside data-i18n, without a re-fetch (TODO #45).
// ---------------------------------------------------------------------------
on(window, 'langchange', () => {
  renderPlayButton();
  if (replayGameData) renderReplayInfo(replayGameData);
  syncBoardToTree();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
// Site-wide Arena header (B193): the replay lives under the "Học" tab.
if (window.PlatformShell) window.PlatformShell.build('learn');
setSpeed(loadSpeed(), false);
renderPlayButton();
window.GvnReplay = {
  destroy() { stopAutoPlay(); clearTimeout(toastTimer); pageAbort.abort(); },
  get tree() { return moveTree; },
  get mainLine() { return mainLine; },
  ready: null,
};
const urlGameId = decodeURIComponent((/^\/replay\/([^/?#]+)/.exec(window.location.pathname) || [])[1] || '');
if (urlGameId) {
  window.GvnReplay.ready = openReplay(urlGameId, new URLSearchParams(window.location.search).get('source') === 'tournament' ? 'tournament' : undefined);
} else {
  window.location.href = '/';
}
