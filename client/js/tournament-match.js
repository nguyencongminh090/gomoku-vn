'use strict';

/**
 * tournament-match.js — Tournament match-play page (client/tournament-match.html).
 *
 * Wires the Phase 6 mockup's match screen to the real Phase 4 gameplay
 * events (server/socket/handlers/TournamentMatchHandler.js). See TODO.md #48
 * / instruction.md B48.
 *
 * Deliberately does NOT reuse client/js/game-ui.js — that file is coupled
 * throughout to `window.RoomState`/`window.RoomClient` and to casual-room-only
 * features (draw offers, bonus-time requests) that TournamentMatchHandler.js
 * never implemented (documented Phase 4 scope decision). Reusing it would
 * mean stripping out more than would be reused. client/js/board.js's
 * `BoardRenderer`, however, is a clean, self-contained canvas renderer with
 * no such coupling, so it IS reused directly.
 *
 * The timer countdown logic (applyTimerSync/tickLocal) is a deliberate,
 * small port of the same pattern in room-socket.js — same reasoning: the
 * algorithm (count down locally between syncs, using a server/client clock
 * offset) is generic, but the surrounding state (`RoomState`) is not
 * something this page has or should have.
 *
 * Manual test checklist:
 *   [ ] Direct navigation to the URL (not just via "Vào trận") loads the
 *       current board state via tmatch:subscribe
 *   [ ] Moves render immediately for both players; timer counts down locally
 *       between server syncs
 *   [ ] Swap2 opening (if the tournament's ruleSet enables it) renders the
 *       placement/choice banner correctly
 *   [ ] Resign asks for confirmation; only shown to participants
 *   [ ] tmatch:ended shows the result overlay with a link back to the
 *       tournament detail page
 *   [ ] A spectator (non-participant) can watch but sees no action buttons
 */

(function authGuard() {
  const token = localStorage.getItem('gvn_token');
  if (!token) { window.location.replace('login.html'); }
})();

const client = new SocketClient();

const params = new URLSearchParams(window.location.search);
const tournamentId = params.get('tournamentId');
const pairingId = params.get('pairingId');
if (!tournamentId || !pairingId) window.location.replace('index.html');

document.getElementById('back-to-tournament').href = `tournament.html?id=${encodeURIComponent(tournamentId)}`;
document.getElementById('match-result-back').href = `tournament.html?id=${encodeURIComponent(tournamentId)}`;

// ── Element refs ─────────────────────────────────────────────────────────
const statusBanner = document.getElementById('status-banner');
const navUser = document.getElementById('nav-user');
const navBadge = document.getElementById('nav-badge');
const matchTitleEl = document.getElementById('match-title');
const matchMetaEl = document.getElementById('match-meta');
const swap2BannerSlot = document.getElementById('swap2-banner-slot');
const matchActionsEl = document.getElementById('match-actions');
const btnResign = document.getElementById('btn-resign');
const moveListEl = document.getElementById('move-list');
const resultOverlay = document.getElementById('match-result-overlay');

const userInfo = client.getUserInfo();
if (userInfo) {
  navUser.textContent = userInfo.displayName;
  navBadge.textContent = userInfo.isGuest ? t('nav.guest_badge') : '';
  navBadge.style.display = userInfo.isGuest ? '' : 'none';
}
client.bindStatusBanner(statusBanner);

// ── Local game state (built from tmatch:init, patched by tmatch:moved/etc.) ─
let gameState = null;    // GameEngine.serialize() shape, plus _lastStone/_nextColor scratch fields
let boardRenderer = null;
let myColor = null;      // 'BLACK' | 'WHITE' | null (spectator)

function myPlayer() {
  return gameState ? gameState.players.find((p) => p.userId === userInfo.userId) : null;
}

client.emit('tmatch:subscribe', { tournamentId, pairingId });

client.on('tmatch:error', (data) => {
  alert(data.code ? t('err.' + data.code.toLowerCase()) : data.message);
  if (data.code === 'NO_ACTIVE_MATCH') window.location.href = `tournament.html?id=${encodeURIComponent(tournamentId)}`;
});

client.on('tmatch:init', (data) => {
  if (data.pairingId !== pairingId) return;
  gameState = data;
  const mp = myPlayer();
  myColor = mp ? mp.color : null;

  initBoard();
  applyTimerSync(data.timerSync);
  renderHeader();
  renderSwap2Banner();
  renderMoveList();
  updateBoardState();

  matchActionsEl.style.display = mp ? '' : 'none';
});

client.on('tmatch:moved', (data) => {
  if (!gameState || data.pairingId !== pairingId) return;
  const colorVal = data.color === 'BLACK' ? 1 : 2;
  gameState.board[data.y][data.x] = colorVal;
  gameState.currentTurn = data.nextTurn;
  gameState.moveCount = data.moveCount;
  if (!gameState.moveHistory) gameState.moveHistory = [];
  gameState.moveHistory.push({ x: data.x, y: data.y, color: data.color, timestamp: Date.now() });
  if (data.timer) timerValues = data.timer;
  if (data.timerSync) applyTimerSync(data.timerSync);
  if (data.gameOver) gameState.status = 'finished';
  if (data.result) gameState.result = data.result;

  updateBoardState();
  renderMoveList();
});

client.on('tmatch:swap2_state', (data) => {
  if (!gameState || data.pairingId !== pairingId) return;
  gameState.board = data.board;
  gameState.moveCount = data.moveCount;
  gameState.moveHistory = data.moveHistory;
  gameState.currentTurn = data.currentTurn;
  gameState.swap2.openingPhase = data.openingPhase;
  Object.assign(gameState.swap2, data.swap2);
  gameState._lastStone = data.lastStone;
  gameState._nextColor = data.nextColor;

  renderSwap2Board();
  renderSwap2Banner();
  renderMoveList();
});

client.on('tmatch:timer_sync', (data) => {
  if (data.pairingId !== pairingId) return;
  applyTimerSync(data);
});

client.on('tmatch:ended', (data) => {
  if (data.pairingId !== pairingId) return;
  stopLocalTimer();
  if (gameState) { gameState.status = 'finished'; gameState.result = data.result; }
  matchActionsEl.style.display = 'none';
  showResultOverlay(data.result);
});

// ── Board ────────────────────────────────────────────────────────────────

function initBoard() {
  if (boardRenderer) return;
  const canvas = document.getElementById('match-canvas');
  boardRenderer = new BoardRenderer(canvas, {
    boardSize: gameState.boardSize,
    onCellClick: (x, y) => {
      if (!gameState) return;
      if (gameState.swap2 && gameState.swap2.enabled && gameState.swap2.openingPhase !== 'play') {
        if (gameState.currentTurn === userInfo.userId
            && (gameState.swap2.openingPhase === 'place3' || gameState.swap2.openingPhase === 'place2')) {
          client.emit('tmatch:swap2_place', { tournamentId, pairingId, x, y });
        }
        return;
      }
      if (gameState.status === 'ongoing') {
        client.emit('tmatch:move', { tournamentId, pairingId, x, y });
      }
    },
  });
  window.addEventListener('resize', () => { if (boardRenderer) boardRenderer.resize(); });
  requestAnimationFrame(() => boardRenderer.resize());
}

function updateBoardState() {
  if (!boardRenderer || !gameState) return;
  let lm = null;
  if (gameState.moveHistory && gameState.moveHistory.length > 0) {
    const last = gameState.moveHistory[gameState.moveHistory.length - 1];
    lm = { x: last.x, y: last.y };
  }
  boardRenderer.setState({
    boardSize: gameState.boardSize,
    board: gameState.board,
    walls: gameState.walls,
    portals: gameState.portals,
    firstMoveZones: gameState.firstMoveZones,
    showZones: gameState.walls.length > 0 && gameState.moveCount === 0,
    lastMove: lm,
    isMyTurn: gameState.currentTurn === userInfo.userId && gameState.status === 'ongoing',
    interactive: !!myPlayer() && gameState.status === 'ongoing',
    myColor,
    winLine: gameState.result ? gameState.result.winLine : null,
    moveHistory: gameState.moveHistory || [],
  });
  renderTimers();
  requestAnimationFrame(() => boardRenderer.resize());
}

function renderSwap2Board() {
  if (!boardRenderer || !gameState) return;
  const mine = gameState.currentTurn === userInfo.userId;
  const placing = gameState.swap2.openingPhase === 'place3' || gameState.swap2.openingPhase === 'place2';
  let previewColor = null;
  if (gameState._nextColor === 'BLACK') previewColor = 'BLACK';
  else if (gameState._nextColor === 'WHITE') previewColor = 'WHITE';

  boardRenderer.setState({
    board: gameState.board,
    interactive: mine && placing,
    isMyTurn: mine && placing,
    myColor: previewColor,
    lastMove: gameState._lastStone || null,
    showZones: false,
    winLine: null,
    moveHistory: gameState.moveHistory || [],
  });
}

// ── Header / meta ────────────────────────────────────────────────────────

function renderHeader() {
  const p1 = gameState.players[0], p2 = gameState.players[1];
  matchTitleEl.textContent = `${p1 ? p1.displayName : '—'} vs ${p2 ? p2.displayName : '—'}`;
  matchMetaEl.innerHTML = `<span class="detail-meta-item"><i class="ph ph-trophy"></i>${t('tmatch.in_tournament')}</span>`;

  document.getElementById('clock-black-name').textContent = p1 ? p1.displayName : '—';
  document.getElementById('clock-white-name').textContent = p2 ? p2.displayName : '—';
}

// ── Swap2 banner (choice phase only — placement phase just uses the board) ─

function renderSwap2Banner() {
  if (!gameState || !gameState.swap2 || !gameState.swap2.enabled) { swap2BannerSlot.innerHTML = ''; return; }
  const { openingPhase } = gameState.swap2;
  const mine = gameState.currentTurn === userInfo.userId;

  if ((openingPhase === 'p2choice' || openingPhase === 'p1choice') && mine) {
    swap2BannerSlot.innerHTML = `
      <div class="swap2-banner">
        <i class="ph ph-shuffle"></i>
        <span>${t('tmatch.swap2_choice_prompt')}</span>
        <div class="swap2-banner__actions">
          <button class="btn-secondary" type="button" id="swap2-choose-black">${t('tmatch.swap2_choose_black')}</button>
          <button class="btn-secondary" type="button" id="swap2-choose-white">${t('tmatch.swap2_choose_white')}</button>
          ${openingPhase === 'p2choice' ? `<button class="btn btn-confirm" type="button" id="swap2-choose-place">${t('tmatch.swap2_choose_place')}</button>` : ''}
        </div>
      </div>
    `;
    const choose = (choice) => client.emit('tmatch:swap2_choice', { tournamentId, pairingId, choice });
    document.getElementById('swap2-choose-black').addEventListener('click', () => choose('black'));
    document.getElementById('swap2-choose-white').addEventListener('click', () => choose('white'));
    const placeBtn = document.getElementById('swap2-choose-place');
    if (placeBtn) placeBtn.addEventListener('click', () => choose('place'));
  } else if (openingPhase !== 'play') {
    swap2BannerSlot.innerHTML = `
      <div class="swap2-banner">
        <i class="ph ph-shuffle"></i>
        <span>${mine ? t('tmatch.swap2_place_prompt') : t('tmatch.swap2_waiting_opponent')}</span>
      </div>
    `;
  } else {
    swap2BannerSlot.innerHTML = '';
  }
}

// ── Move list ────────────────────────────────────────────────────────────

function renderMoveList() {
  if (!gameState) return;
  const history = gameState.moveHistory || [];
  moveListEl.innerHTML = history.map((m, i) => {
    const moveNum = Math.floor(i / 2) + 1;
    const colorLabel = m.color === 'BLACK' ? t('tmatch.black') : t('tmatch.white');
    return `<div class="move-list__row"><span>${moveNum}. ${colorLabel}</span><span>(${m.x},${m.y})</span></div>`;
  }).join('');
  moveListEl.scrollTop = moveListEl.scrollHeight;
}

// ── Timer (ported pattern from room-socket.js's applyTimerSync/tickLocal) ──

let timerValues = { black: 0, white: 0 };
let localTimer = null;
let clockOffsetMs = 0;
let activeDeadline = null;
let activeColor = null;

function serverNow() { return Date.now() + clockOffsetMs; }
function stopLocalTimer() { if (localTimer) { clearInterval(localTimer); localTimer = null; } }

function formatTime(seconds) {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function tickLocal() {
  if (activeDeadline === null || !activeColor) return;
  const remaining = Math.max(0, Math.round((activeDeadline - serverNow()) / 1000));
  timerValues = { ...timerValues, [activeColor]: remaining };
  renderTimers();
  if (remaining <= 0) stopLocalTimer();
}

function applyTimerSync(sync) {
  if (!sync) return;
  clockOffsetMs = (sync.serverTime || Date.now()) - Date.now();
  timerValues = { black: sync.black, white: sync.white };
  activeColor = sync.activeColor;
  activeDeadline = sync.deadline;
  stopLocalTimer();
  renderTimers();
  if (sync.running && sync.deadline) localTimer = setInterval(tickLocal, 1000);
}

function renderTimers() {
  const bTimeEl = document.getElementById('clock-black-time');
  const wTimeEl = document.getElementById('clock-white-time');
  bTimeEl.textContent = formatTime(timerValues.black);
  wTimeEl.textContent = formatTime(timerValues.white);
  bTimeEl.classList.toggle('is-low', timerValues.black <= 10);
  wTimeEl.classList.toggle('is-low', timerValues.white <= 10);

  const blackClockEl = document.getElementById('clock-black');
  const whiteClockEl = document.getElementById('clock-white');
  if (gameState) {
    const swap2 = gameState.swap2;
    let isBlackTurn;
    if (swap2 && swap2.enabled && !swap2.colorsAssigned) {
      isBlackTurn = gameState.currentTurn === swap2.firstPlayerId;
    } else {
      const blackP = gameState.players.find((p) => p.color === 'BLACK');
      isBlackTurn = gameState.currentTurn === (blackP ? blackP.userId : null);
    }
    blackClockEl.classList.toggle('is-active', isBlackTurn && gameState.status === 'ongoing');
    whiteClockEl.classList.toggle('is-active', !isBlackTurn && gameState.status === 'ongoing');
  }
}

// ── Resign ───────────────────────────────────────────────────────────────

btnResign.addEventListener('click', () => {
  if (!confirm(t('tmatch.confirm_resign'))) return;
  client.emit('tmatch:resign', { tournamentId, pairingId });
});

// ── Result overlay ───────────────────────────────────────────────────────

function showResultOverlay(result) {
  if (!result) return;
  const mp = myPlayer();
  let icon = '🏁', title, sub = '';

  if (result.winner === 'draw') {
    icon = '🤝'; title = t('tmatch.result_draw');
  } else if (mp && result.winner === userInfo.userId) {
    icon = '🏆'; title = t('tmatch.result_you_won');
  } else if (mp) {
    icon = '😔'; title = t('tmatch.result_you_lost');
  } else {
    const winnerP = gameState.players.find((p) => p.userId === result.winner);
    title = t('tmatch.result_winner', { name: winnerP ? winnerP.displayName : '—' });
  }
  if (result.reason === 'resign') sub = t('tmatch.reason_resign');
  else if (result.reason === 'timeout') sub = t('tmatch.reason_timeout');
  else if (result.reason === 'board_full') sub = t('tmatch.reason_board_full');

  document.getElementById('match-result-icon').textContent = icon;
  document.getElementById('match-result-title').textContent = title;
  document.getElementById('match-result-sub').textContent = sub;
  resultOverlay.classList.add('visible');
}

window.addEventListener('langchange', () => {
  if (gameState) { renderHeader(); renderSwap2Banner(); renderMoveList(); }
});
