'use strict';

/**
 * tournament-match.js — Tournament match-play page (client/tournament-match.html).
 *
 * Wires the Phase 6 mockup's match screen to the real Phase 4 gameplay
 * events (server/socket/handlers/TournamentMatchHandler.js). See TODO.md #48
 * / instruction.md B48.
 *
 * Deliberately does NOT reuse client/js/game-ui.js — that file is coupled
 * throughout to `window.RoomState`/`window.RoomClient`. Reusing it would mean
 * stripping out more than would be reused, so draw-offer/bonus-time-request
 * UI (TODO.md #57) got its own small port here instead of a shared module —
 * same CSS classes and i18n keys as game-ui.js's version, different plumbing.
 * client/js/board.js's `BoardRenderer`, however, is a clean, self-contained
 * canvas renderer with no such coupling, so it IS reused directly.
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
 *   [ ] Draw offer/accept/decline works between the two participants
 *       (TODO.md #57); the offering player sees a "waiting" state
 *   [ ] Bonus-time request auto-grants up to config.TIME_REQUEST_FREE times,
 *       then requires opponent accept/decline; limit resets each new game
 *       in a series
 *   [ ] tmatch:ended shows the result overlay with a link back to the
 *       tournament detail page
 *   [ ] A spectator (non-participant) can watch but sees no action buttons
 */

(function authGuard() {
  // See lobby.js — optimistic only (TODO.md #68); the socket handshake is the
  // real check, since an HttpOnly cookie is unreadable from here.
  window.GvnSession.requireAuth();
})();

const client = new SocketClient();

const params = new URLSearchParams(window.location.search);
const tournamentId = params.get('tournamentId');
const pairingId = params.get('pairingId');
if (!tournamentId || !pairingId) window.location.replace('index.html');

const backToTournamentLink = document.getElementById('back-to-tournament');
backToTournamentLink.href = `tournament.html?id=${encodeURIComponent(tournamentId)}`;
document.getElementById('match-result-back').href = `tournament.html?id=${encodeURIComponent(tournamentId)}`;

// TODO.md #62: locked while the pairing is still undecided (mid-game or
// waiting on series check-in) — released once a final result overlay shows
// (single-game pairing decided, or series decided). Prevents a player from
// wandering off mid-series the way the old "back to tournament to check in"
// link on the between-games overlay used to require.
function setLeaveLocked(locked) {
  backToTournamentLink.classList.toggle('detail-back--disabled', locked);
  backToTournamentLink.setAttribute('aria-disabled', locked ? 'true' : 'false');
}
backToTournamentLink.addEventListener('click', (e) => {
  if (backToTournamentLink.classList.contains('detail-back--disabled')) e.preventDefault();
});
setLeaveLocked(true);

// ── Element refs ─────────────────────────────────────────────────────────
const statusBanner = document.getElementById('status-banner');
const navUser = document.getElementById('nav-user');
const navBadge = document.getElementById('nav-badge');
const matchTitleEl = document.getElementById('match-title');
const matchMetaEl = document.getElementById('match-meta');
const swap2BannerSlot = document.getElementById('swap2-banner-slot');
const matchActionsEl = document.getElementById('match-actions');
const btnResign = document.getElementById('btn-resign');
const btnDraw = document.getElementById('btn-draw');
const btnTime = document.getElementById('btn-time');
const moveListEl = document.getElementById('move-list');
const resultOverlay = document.getElementById('match-result-overlay');

// Live view of the session identity (TODO.md #68).
//
// Deliberately an object of getters rather than a snapshot: identity now
// arrives from the server as `session:me` shortly AFTER this module runs, so
// a value captured here would be null on the first load following the
// migration and would never update. Every `userInfo.userId` / `.displayName`
// read below therefore stays live, with no re-assignment plumbing. Use
// `userInfo.signedIn` where the old code tested the snapshot for truthiness —
// this object itself is always truthy.
const userInfo = {
  get signedIn()    { return !!window.GvnSession.getUser(); },
  get userId()      { const u = window.GvnSession.getUser(); return u ? u.userId : null; },
  get displayName() { const u = window.GvnSession.getUser(); return u ? u.displayName : ''; },
  get isGuest()     { const u = window.GvnSession.getUser(); return !!(u && u.isGuest); },
};
if (userInfo.signedIn) {
  navUser.textContent = userInfo.displayName;
  navBadge.textContent = userInfo.isGuest ? t('nav.guest_badge') : '';
  navBadge.style.display = userInfo.isGuest ? '' : 'none';
}
client.bindStatusBanner(statusBanner);

// ── Local game state (built from tmatch:init, patched by tmatch:moved/etc.) ─
let gameState = null;    // GameEngine.serialize() shape, plus _lastStone/_nextColor scratch fields
let boardRenderer = null;
let myColor = null;      // 'BLACK' | 'WHITE' | null (spectator)
let seriesInfo = null;   // { seriesMode, gameIndex, seriesScore, seriesGameCount, seriesTargetScore, seriesMargin } | null (TODO.md #50)
let drawOfferPending = null;   // { from, fromName } | null (TODO.md #57)
let timeRequestPending = null; // { from, fromName, bonus } | null (TODO.md #57)

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
  seriesInfo = data.series || null;
  const mp = myPlayer();
  myColor = mp ? mp.color : null;
  setLeaveLocked(true); // pairing active again — see showResultOverlay for the release point

  // A new game just (re)started (initial start, reconnect, or the next game
  // in a series) — any draw/time-request prompt from a PREVIOUS game no
  // longer applies (TODO.md #57's per-game time-request limit also resets
  // server-side every startMatch() call — see TournamentMatchHandler.js).
  drawOfferPending = null;
  timeRequestPending = null;

  hideSeriesTransition(); // the next game just started — clear any "waiting for next game" state

  initBoard();
  applyTimerSync(data.timerSync);
  renderHeader();
  renderSwap2Banner();
  renderMoveList();
  updateBoardState();

  matchActionsEl.style.display = mp ? '' : 'none';
  renderDrawPrompt();
  renderTimePrompt();
});

// TODO.md #86 — TEMPORARY instrumentation, not a permanent fix. Measures
// click→ack latency (delta from client.emit('tmatch:move') to the matching
// 'tmatch:moved' echo) plus transport type and tab visibility at click time,
// to find out whether the reported ~1s click delay is a transport-layer
// issue (background-tab throttle, network hiccup, Cloudflare Tunnel
// fallback to polling) — see docs/instruction/B86-*.md. Remove this block
// (and pendingMoveInstrumentation) once a real measurement has been
// captured, unless a decision is made to keep it as permanent logging.
let pendingMoveInstrumentation = null;

client.on('tmatch:moved', (data) => {
  if (!gameState || data.pairingId !== pairingId) return;

  if (pendingMoveInstrumentation
      && pendingMoveInstrumentation.x === data.x
      && pendingMoveInstrumentation.y === data.y
      && pendingMoveInstrumentation.color === data.color) {
    const delta = performance.now() - pendingMoveInstrumentation.t0;
    if (delta > 300) {
      console.warn('[B86 instrumentation] slow click→ack', {
        deltaMs: Math.round(delta),
        transportAtClick: pendingMoveInstrumentation.transport,
        transportNow: client.socket && client.socket.io && client.socket.io.engine
          ? client.socket.io.engine.transport.name : 'unknown',
        tabHiddenAtClick: pendingMoveInstrumentation.hidden,
        tabHiddenNow: document.visibilityState !== 'visible',
        x: data.x, y: data.y,
      });
    }
    pendingMoveInstrumentation = null;
  }

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

  // Move sound cue — same trigger as room-socket.js's game:moved handler
  // (TODO.md #74: tournament matches never called audioManager at all).
  if (window.audioManager) {
    const mp = myPlayer();
    window.audioManager.playMoveSound(!mp || mp.color !== data.color);
  }

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

  // The whole tournament was cancelled by the organizer mid-match (TODO.md
  // #59) — not a normal game outcome, so skip the win/loss/draw overlay
  // entirely and redirect straight back, same pattern as the NO_ACTIVE_MATCH
  // error above.
  if (data.result && data.result.reason === 'tournament_cancelled') {
    alert(t('tmatch.tournament_cancelled_message'));
    window.location.href = `tournament.html?id=${encodeURIComponent(tournamentId)}`;
    return;
  }

  if (gameState) { gameState.status = 'finished'; gameState.result = data.result; }
  matchActionsEl.style.display = 'none';
  drawOfferPending = null;
  timeRequestPending = null;

  // Win/lose sound cue, participants only — same trigger as
  // room-socket.js's game:ended handler (TODO.md #74).
  if (window.audioManager && myPlayer() && data.result && data.result.winner !== 'draw') {
    if (data.result.winner === userInfo.userId) window.audioManager.playWinSound();
    else window.audioManager.playLoseSound();
  }
  renderDrawPrompt();
  renderTimePrompt();

  if (data.series) {
    seriesInfo = { ...seriesInfo, scores: data.series.scores };
    renderScorePanel(seriesInfo.seriesMode && seriesInfo.seriesMode !== 'single');
  }

  // A game inside an unfinished series (TODO.md #50) ends differently from
  // the whole pairing: show a lighter "waiting for next game" transition
  // instead of the final result overlay + "back to tournament" link — the
  // next game's tmatch:init (already inbound, since the match room stays
  // joined — see TournamentMatchHandler.js's _endMatch) clears it again.
  if (data.series && data.series.seriesComplete === false) {
    showSeriesTransition(data.result);
  } else if (seriesInfo && seriesInfo.seriesMode && seriesInfo.seriesMode !== 'single') {
    // The PAIRING's overall winner can differ from who won this last
    // individual game (e.g. a series that ties 1-1 after 2 games) —
    // data.result is only ever this game's outcome, so a decided multi-game
    // series must show its OWN winner/draw, not the last game's.
    showResultOverlay(data.result, {
      winnerUserId: data.series.seriesWinnerUserId,
      isDraw: data.series.seriesIsDraw,
    });
  } else {
    showResultOverlay(data.result);
  }
});

// ── Board ────────────────────────────────────────────────────────────────

// Board display style (Giấy/Paper vs Đá/Stone) — persists across pages via
// the shared 'play3cr_board_display' localStorage key (room-ui.js:618) —
// read it here instead of leaving BoardRenderer on its hardcoded 'paper'
// default, same root cause as TODO.md #55's click-mode fix (initBoard()
// never read a saved setting at all).
//
// TODO.md #74: this page has no Settings tab of its own (the room Settings
// tab's other controls — board size, win rule, Wall/Portal, Swap2, timer —
// are tournament-fixed and shouldn't be editable mid-match), but the global
// Settings panel (settings-panel.js) can now change Display mode from here
// too, so this DOES need to live-sync like click-mode does.
function boardDisplayMode() {
  const v = localStorage.getItem('play3cr_board_display');
  return v === 'stone' ? 'stone' : 'paper';
}

window.addEventListener('displaymodechange', () => {
  if (boardRenderer) updateBoardState();
});

function initBoard() {
  if (boardRenderer) return;
  const canvas = document.getElementById('match-canvas');
  boardRenderer = new BoardRenderer(canvas, {
    boardSize: gameState.boardSize,
    // TODO.md #55: initBoard() never read the user's click-mode setting, so
    // BoardRenderer fell back to its hardcoded 'double' default regardless of
    // what Cài đặt had — game-ui.js:96 (room.html) is the reference behavior.
    clickMode: (typeof window.getClickMode === 'function') ? window.getClickMode() : 'double',
    displayMode: boardDisplayMode(),
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
        // TODO.md #86 instrumentation — see the matching block on
        // 'tmatch:moved' above for what this measures and why.
        pendingMoveInstrumentation = {
          x, y,
          color: myColor === 1 ? 'BLACK' : 'WHITE',
          t0: performance.now(),
          transport: client.socket && client.socket.io && client.socket.io.engine
            ? client.socket.io.engine.transport.name : 'unknown',
          hidden: document.visibilityState !== 'visible',
        };
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
    displayMode: boardDisplayMode(),
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
    displayMode: boardDisplayMode(),
  });
}

// ── Header / meta ────────────────────────────────────────────────────────

const slot1NameEl = document.getElementById('slot-1-name');
const slot2NameEl = document.getElementById('slot-2-name');
const scorePanelEl = document.getElementById('score-panel');
const scorePanelTitleEl = document.getElementById('score-panel-title');
const scoreBodyEl = document.getElementById('score-body');

function renderHeader() {
  const p1 = gameState.players[0], p2 = gameState.players[1];
  matchTitleEl.textContent = `${p1 ? p1.displayName : '—'} vs ${p2 ? p2.displayName : '—'}`;
  slot1NameEl.textContent = p1 ? p1.displayName : '—';
  slot2NameEl.textContent = p2 ? p2.displayName : '—';

  let metaHtml = `<span class="detail-meta-item"><i class="ph ph-trophy"></i>${t('tmatch.in_tournament')}</span>`;
  // Only shown for an actual multi-game series; a plain 'single'-mode pairing
  // keeps today's meta line unchanged and the score-panel stays hidden.
  const isSeries = seriesInfo && seriesInfo.seriesMode && seriesInfo.seriesMode !== 'single';
  if (isSeries) {
    const gameLabel = t('tmatch.series_game_index', { n: seriesInfo.gameIndex + 1 });
    metaHtml += `<span class="detail-meta-item"><i class="ph ph-medal"></i>${gameLabel}</span>`;
    const targetLabel = seriesInfo.seriesMode === 'raceToMargin'
      ? t('tmatch.series_race_to_margin', { target: seriesInfo.seriesTargetScore, margin: seriesInfo.seriesMargin })
      : t('tmatch.series_fixed_count', { n: seriesInfo.seriesGameCount });
    metaHtml += `<span class="detail-meta-item"><i class="ph ph-flag-checkered"></i>${targetLabel}</span>`;
  }
  matchMetaEl.innerHTML = metaHtml;

  const black = gameState.players.find(p => p.color === 'BLACK');
  const white = gameState.players.find(p => p.color === 'WHITE');
  document.getElementById('clock-black-name').textContent = black ? black.displayName : '—';
  document.getElementById('clock-white-name').textContent = white ? white.displayName : '—';

  renderScorePanel(isSeries);
}

// Series score table (TODO.md #52/#55 — "Room.html has score count, you can
// use it": reuses .score-panel/.score-table (room.css) the same way
// room-ui.js's renderScoreTable() does, instead of the old inline meta-line
// score text — just a 2-column Tên/Điểm table since a series tracks one
// numeric "games won" score per player, not room.html's rematch Win/Loss/Draw.
function renderScorePanel(isSeries) {
  if (!isSeries) {
    scorePanelEl.style.display = 'none';
    return;
  }
  // seriesInfo.scores is null until the series' first game finishes
  // (pairing.seriesScore starts null server-side) — fall back to the two
  // known players at 0 each so the table (and the fact a series is running)
  // is visible from game 1, matching room.html's score-panel showing seated
  // players at 0 before any result exists.
  const scores = seriesInfo.scores || gameState.players.map((p) => ({ displayName: p.displayName, score: 0 }));
  scorePanelTitleEl.textContent = seriesInfo.seriesMode === 'raceToMargin'
    ? t('tmatch.score_title_race_to_margin', { target: seriesInfo.seriesTargetScore })
    : t('tmatch.score_title_fixed_count', { n: seriesInfo.seriesGameCount });
  scoreBodyEl.innerHTML = scores.map((s) => `
    <tr>
      <td>${escapeHtml(s.displayName)}</td>
      <td>${s.score}</td>
    </tr>
  `).join('');
  scorePanelEl.style.display = '';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
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

  // Beep once per second through the active player's own final 10s — same
  // trigger as room-socket.js's tickLocal (TODO.md #74).
  if (window.audioManager && gameState && gameState.status === 'ongoing' && myColor) {
    const myColorLower = myColor === 'BLACK' ? 'black' : 'white';
    if (gameState.currentTurn === userInfo.userId && myColorLower === activeColor && remaining > 0 && remaining <= 10) {
      window.audioManager.playTimerTickSound();
    }
  }

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

// ── Draw offer / bonus-time request (TODO.md #57) ───────────────────────────
// Deliberately a small self-contained port, not a reuse of game-ui.js's
// renderDrawPrompt/renderTimePrompt — those are written against
// window.RoomState, which this page has never had (see file header).
// Reuses game.css's .draw-prompt/.btn-draw-action classes and the existing
// game.* i18n keys as-is (same wording as room.html, no tmatch.* duplicates).

btnDraw.addEventListener('click', () => {
  client.emit('tmatch:draw_offer', { tournamentId, pairingId });
});
btnTime.addEventListener('click', () => {
  if (!timeRequestPending) client.emit('tmatch:request_time', { tournamentId, pairingId });
});

function renderDrawPrompt() {
  const el = document.getElementById('draw-prompt-area');
  if (!el) return;
  if (!drawOfferPending || !gameState || gameState.status !== 'ongoing') { el.innerHTML = ''; return; }

  if (drawOfferPending.from === userInfo.userId) {
    el.innerHTML = `<div class="draw-prompt">${t('game.draw_waiting')}</div>`;
    return;
  }

  el.innerHTML = `
    <div class="draw-prompt">
      <span>${t('game.draw_offer', { name: escapeHtml(drawOfferPending.fromName || t('game.opponent_generic')) })}</span>
      <div class="draw-prompt__actions">
        <button class="btn-draw-action btn-draw-accept" type="button" id="draw-accept-btn">${t('game.btn_accept')}</button>
        <button class="btn-draw-action btn-draw-decline" type="button" id="draw-decline-btn">${t('game.btn_decline')}</button>
      </div>
    </div>
  `;
  document.getElementById('draw-accept-btn').addEventListener('click', () => client.emit('tmatch:draw_accept', { tournamentId, pairingId }));
  document.getElementById('draw-decline-btn').addEventListener('click', () => client.emit('tmatch:draw_decline', { tournamentId, pairingId }));
}

function renderTimePrompt() {
  const el = document.getElementById('time-prompt-area');
  if (!el) return;
  if (!timeRequestPending || !gameState || gameState.status !== 'ongoing') { el.innerHTML = ''; return; }

  if (timeRequestPending.from === userInfo.userId) {
    el.innerHTML = `<div class="draw-prompt">${t('game.time_waiting')}</div>`;
    return;
  }

  el.innerHTML = `
    <div class="draw-prompt">
      <span>${t('game.time_offer', { name: escapeHtml(timeRequestPending.fromName || ''), bonus: timeRequestPending.bonus || 10 })}</span>
      <div class="draw-prompt__actions">
        <button class="btn-draw-action btn-draw-accept" type="button" id="time-accept-btn">${t('game.btn_accept')}</button>
        <button class="btn-draw-action btn-draw-decline" type="button" id="time-decline-btn">${t('game.btn_decline')}</button>
      </div>
    </div>
  `;
  document.getElementById('time-accept-btn').addEventListener('click', () => client.emit('tmatch:time_accept', { tournamentId, pairingId }));
  document.getElementById('time-decline-btn').addEventListener('click', () => client.emit('tmatch:time_decline', { tournamentId, pairingId }));
}

client.on('tmatch:draw_offered', (data) => {
  if (data.pairingId !== pairingId) return;
  drawOfferPending = { from: data.from, fromName: data.fromName };
  renderDrawPrompt();
});
client.on('tmatch:draw_declined', (data) => {
  if (data.pairingId !== pairingId) return;
  drawOfferPending = null;
  renderDrawPrompt();
});
client.on('tmatch:time_offered', (data) => {
  if (data.pairingId !== pairingId) return;
  timeRequestPending = { from: data.from, fromName: data.fromName, bonus: data.bonus };
  renderTimePrompt();
});
client.on('tmatch:time_granted', (data) => {
  if (data.pairingId !== pairingId) return;
  timeRequestPending = null;
  renderTimePrompt();
});
client.on('tmatch:time_declined', (data) => {
  if (data.pairingId !== pairingId) return;
  timeRequestPending = null;
  renderTimePrompt();
});

// ── Result overlay ───────────────────────────────────────────────────────

/**
 * @param {object} result — the last GAME's engine result (used for `reason`
 *   regardless of scope — see below).
 * @param {{winnerUserId: string|null, isDraw: boolean}} [seriesOverride] —
 *   when the pairing is a decided multi-game series (TODO.md #50), the
 *   PAIRING's overall winner can differ from who won this last game (e.g. a
 *   series tied 1-1 after 2 games) — pass this to show the series' own
 *   outcome instead of defaulting to `result.winner`.
 */
// Phosphor icon (this app's icon font everywhere else — see topnav/action-banner/
// pairing-card — not raw emoji) for a win/lose/draw/spectator outcome.
function outcomeIconClass(isDraw, isWin, isSpectator) {
  if (isDraw) return 'ph-handshake';
  if (isSpectator) return 'ph-flag-checkered';
  return isWin ? 'ph-trophy' : 'ph-smiley-sad';
}

function showResultOverlay(result, seriesOverride) {
  if (!result) return;
  const mp = myPlayer();
  let iconClass = 'ph-flag-checkered', title, sub = '';

  const isDraw = seriesOverride ? seriesOverride.isDraw : result.winner === 'draw';
  const winnerUserId = seriesOverride ? seriesOverride.winnerUserId : result.winner;

  if (isDraw) {
    iconClass = outcomeIconClass(true); title = t('tmatch.result_draw');
  } else if (mp && winnerUserId === userInfo.userId) {
    iconClass = outcomeIconClass(false, true); title = t('tmatch.result_you_won');
  } else if (mp) {
    iconClass = outcomeIconClass(false, false); title = t('tmatch.result_you_lost');
  } else {
    iconClass = outcomeIconClass(false, false, true);
    const winnerP = gameState.players.find((p) => p.userId === winnerUserId);
    title = t('tmatch.result_winner', { name: winnerP ? winnerP.displayName : '—' });
  }
  if (result.reason === 'resign') sub = t('tmatch.reason_resign');
  else if (result.reason === 'timeout') sub = t('tmatch.reason_timeout');
  else if (result.reason === 'board_full') sub = t('tmatch.reason_board_full');

  document.getElementById('match-result-icon').className = `match-result-card__icon ph-bold ${iconClass}`;
  document.getElementById('match-result-title').textContent = title;
  document.getElementById('match-result-sub').textContent = sub;
  resultOverlay.classList.add('visible');
  setLeaveLocked(false); // pairing decided (single-game, or series' final game) — safe to leave now
}

// ── Series between-games transition (TODO.md #50 / #62) ─────────────────────
// TODO.md #62: the "Sẵn sàng" button here reuses the SAME tournament:ready
// socket event tournament-detail.js's pairing-card "Sẵn sàng" button sends
// (server/socket/handlers/TournamentHandler.js's pairingAction('tournament:ready', ...)
// -> TournamentManager.markPairingReady() -> PairingLifecycle.markReady()) —
// no new server event, only a second UI entry point into the existing one.

const seriesTransitionOverlay = document.getElementById('series-transition-overlay');
const seriesTransitionReadyBtn = document.getElementById('series-transition-ready-btn');
const seriesTransitionWaitingEl = document.getElementById('series-transition-waiting');

seriesTransitionReadyBtn.addEventListener('click', () => {
  client.emit('tournament:ready', { tournamentId, pairingId });
  seriesTransitionReadyBtn.style.display = 'none';
  seriesTransitionWaitingEl.textContent = t('tmatch.series_ready_waiting');
  seriesTransitionWaitingEl.style.display = '';
});

function showSeriesTransition(result) {
  const mp = myPlayer();
  let title, iconClass;
  if (result.winner === 'draw') {
    iconClass = outcomeIconClass(true); title = t('tmatch.result_draw');
  } else if (mp && result.winner === userInfo.userId) {
    iconClass = outcomeIconClass(false, true); title = t('tmatch.result_you_won');
  } else if (mp) {
    iconClass = outcomeIconClass(false, false); title = t('tmatch.result_you_lost');
  } else {
    iconClass = outcomeIconClass(false, false, true);
    const winnerP = gameState ? gameState.players.find((p) => p.userId === result.winner) : null;
    title = t('tmatch.result_winner', { name: winnerP ? winnerP.displayName : '—' });
  }
  document.getElementById('series-transition-icon').className = `match-result-card__icon ph-bold ${iconClass}`;
  document.getElementById('series-transition-title').textContent = title;

  const sub = (seriesInfo && seriesInfo.scores)
    ? seriesInfo.scores.map((s) => `${s.displayName}: ${s.score}`).join(' — ')
    : '';
  document.getElementById('series-transition-sub').textContent = sub;

  // Fresh Ready-state window every game (PairingLifecycle.startNextGame
  // clears pairing.readyPlayers) — reset the button/waiting toggle each time
  // this overlay opens rather than carrying over the previous game's click.
  if (mp) {
    seriesTransitionReadyBtn.style.display = '';
    seriesTransitionWaitingEl.style.display = 'none';
  } else {
    // Spectators can't check in on anyone's behalf — just show the wait state.
    seriesTransitionReadyBtn.style.display = 'none';
    seriesTransitionWaitingEl.textContent = t('tmatch.series_ready_waiting_spectator');
    seriesTransitionWaitingEl.style.display = '';
  }

  seriesTransitionOverlay.classList.add('visible');
  setLeaveLocked(true); // still mid-series — see showResultOverlay for the release point
}

function hideSeriesTransition() {
  seriesTransitionOverlay.classList.remove('visible');
}

// ── Chat (ported from room.html/room.js — TODO.md #50 step 7 "component
// reuse only": same CSS classes and interaction pattern, but a fresh, small,
// self-contained implementation rather than reusing chat-ui.js/room.js's JS,
// since those are written against window.RoomState which this page has
// deliberately never had (see this file's header). ─────────────────────────

const chatMessagesEl = document.getElementById('chat-messages');
const chatInputEl = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');

// Server-sent chat text arrives with `<`/`>` escaped (ChatHandler.sanitize) —
// decode before writing into a text node so the reader sees what the sender
// typed. Safe because textContent never parses its input as markup.
function decodeChatText(str) {
  return String(str).replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function appendChatMessage(msg) {
  const div = document.createElement('div');
  const isSelf = msg.fromId === userInfo.userId;
  div.className = `chat-msg ${isSelf ? 'chat-msg--self' : 'chat-msg--other'}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat-msg__bubble';

  if (!isSelf) {
    const nameSpan = document.createElement('div');
    nameSpan.className = 'chat-msg__name';
    nameSpan.textContent = msg.from;
    bubble.appendChild(nameSpan);
  }

  const textSpan = document.createElement('div');
  textSpan.className = 'chat-msg__text';
  textSpan.textContent = decodeChatText(msg.text);
  bubble.appendChild(textSpan);

  div.appendChild(bubble);
  chatMessagesEl.appendChild(div);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function sendChat() {
  const text = chatInputEl.value.trim();
  if (!text) return;
  client.emit('tmatch:chat_message', { tournamentId, pairingId, text });
  chatInputEl.value = '';
}

btnSend.addEventListener('click', sendChat);
chatInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

client.on('chat:message', (msg) => appendChatMessage(msg));
// Chat-specific errors (CHAT_RATE_LIMITED, MUST_BE_IN_MATCH_TO_CHAT) are
// already covered by the generic tmatch:error handler registered above.

// ── Spectators tab (ported room.html component — TODO.md #50 step 7) ───────

const usersListEl = document.getElementById('users-list');

function renderSpectators(spectators) {
  usersListEl.innerHTML = (spectators || []).map(
    (s) => `<li><span class="user-name">${escapeHtml(s.displayName)}</span></li>`
  ).join('');
}

client.on('tmatch:presence', (data) => {
  if (data.pairingId !== pairingId) return;
  renderSpectators(data.spectators);
});

// ── Tabs: Nước đi | Trò chuyện | Khán giả (ported room.html chrome) ─────────

const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabBtns.forEach((b) => b.classList.remove('tab-btn--active'));
    tabContents.forEach((c) => c.classList.remove('tab-content--active'));
    btn.classList.add('tab-btn--active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(tabId).classList.add('tab-content--active');
    if (tabId === 'tab-chat') chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  });
});

window.addEventListener('langchange', () => {
  if (gameState) { renderHeader(); renderSwap2Banner(); renderMoveList(); }
});

// TODO.md #55: live-sync an already-open match when Cài đặt's click-mode
// toggle changes, same mechanism room-ui.js:560 uses for room.html.
window.addEventListener('clickmodechange', (e) => {
  if (boardRenderer) boardRenderer.clickMode = e.detail.mode;
});
