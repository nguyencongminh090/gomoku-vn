'use strict';

/**
 * lobby.js — Lobby UI controller.
 *
 * Responsibilities:
 *   - Render live room list from server
 *   - Create room modal (collect settings → emit room:create)
 *   - Join room (emit room:join → redirect to room page)
 *   - Display user info + logout
 *
 * Manual test checklist:
 *   [ ] No token → redirect to login
 *   [ ] Room list renders on lobby:update
 *   [ ] Empty state shows "Chưa có phòng nào"
 *   [ ] Create room modal opens/closes
 *   [ ] room:create emits correct settings payload
 *   [ ] room:joined → stores roomId → redirects to room.html
 *   [ ] room:error shows alert
 *   [ ] Logout clears token and redirects
 */

// ---------------------------------------------------------------------------
// Auth guard: redirect if no token
// ---------------------------------------------------------------------------
(function authGuard() {
  const token = localStorage.getItem('gvn_token');
  if (!token) {
    window.location.replace('login.html');
    return;
  }
})();

// ---------------------------------------------------------------------------
// Initialize Socket.io client
// ---------------------------------------------------------------------------
const client = new SocketClient();

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const statusBanner  = document.getElementById('status-banner');
const navUser       = document.getElementById('nav-user');
const navBadge      = document.getElementById('nav-badge');
const btnLogout     = document.getElementById('btn-logout');
const roomCount     = document.getElementById('room-count');
const roomListEl    = document.getElementById('room-list');
const btnCreate     = document.getElementById('btn-create');
const modalOverlay  = document.getElementById('modal-create');
const modalClose    = document.getElementById('modal-close');
const modalCancel   = document.getElementById('modal-cancel');
const modalConfirm  = document.getElementById('modal-confirm');
let currentRooms = [];

// ---------------------------------------------------------------------------
// Display user info in nav
// ---------------------------------------------------------------------------
const userInfo = client.getUserInfo();
if (userInfo) {
  navUser.textContent = userInfo.displayName;
  navBadge.textContent = userInfo.isGuest ? t('nav.guest_badge') : '';
  navBadge.style.display = userInfo.isGuest ? '' : 'none';
}

// Bind status banner
client.bindStatusBanner(statusBanner);

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------
btnLogout.addEventListener('click', () => {
  client.logout();
});

// ---------------------------------------------------------------------------
// Subscribe to lobby updates
// ---------------------------------------------------------------------------
client.emit('lobby:subscribe');

client.on('lobby:update', (data) => {
  currentRooms = data.rooms || [];
  renderRoomList(currentRooms);
});

// ── Online Users Panel ──────────────────────────────────────────────────────
const onlineCountEl     = document.getElementById('online-count');
const onlinePanelCount  = document.getElementById('online-panel-count');
const onlinePanelToggle = document.getElementById('online-panel-toggle');
const onlinePanelBody   = document.getElementById('online-panel-body');
const onlineUserList    = document.getElementById('online-user-list');

// Toggle panel open/close
if (onlinePanelToggle) {
  onlinePanelToggle.addEventListener('click', () => {
    onlinePanelToggle.classList.toggle('open');
    onlinePanelBody.classList.toggle('open');
  });
}

client.on('lobby:online_users', (users) => {
  const count = users.length;

  // Update header badge
  if (onlineCountEl) {
    onlineCountEl.textContent = `— ${count} online`;
  }
  if (onlinePanelCount) {
    onlinePanelCount.textContent = count;
  }

  // Render user list
  if (onlineUserList) {
    if (count === 0) {
      onlineUserList.innerHTML = '<li style="color:var(--c-ink-3);font-style:italic;">Không có ai online</li>';
    } else {
      onlineUserList.innerHTML = users.map((name, i) => {
        const animDelay = (i * 0.05).toFixed(2);
        return `<li class="animate-fade-up" style="animation-delay: ${animDelay}s">${escapeHtml(name)}</li>`;
      }).join('');
    }
  }
});

client.on('room:error', (data) => {
  alert(data.message);
});

// Auto-redirect if server detects we are already in a room
client.on('room:joined', (data) => {
  window.location.replace(`room.html?id=${data.roomId}`);
});

// ---------------------------------------------------------------------------
// Room List Rendering
// ---------------------------------------------------------------------------

function renderRoomList(rooms) {
  roomCount.textContent = rooms.length > 0 ? `(${rooms.length})` : '';

  if (rooms.length === 0) {
    roomListEl.innerHTML = `
      <div class="room-list__empty">
        <div class="room-list__empty-icon">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="56" height="56" rx="14" fill="var(--c-surface-2)"/>
            <line x1="14" y1="14" x2="14" y2="42" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="22" y1="14" x2="22" y2="42" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="30" y1="14" x2="30" y2="42" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="38" y1="14" x2="38" y2="42" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="14" y1="14" x2="42" y2="14" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="14" y1="22" x2="42" y2="22" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="14" y1="30" x2="42" y2="30" stroke="var(--c-border)" stroke-width="1.5"/>
            <line x1="14" y1="38" x2="42" y2="38" stroke="var(--c-border)" stroke-width="1.5"/>
            <circle cx="22" cy="22" r="5.5" fill="var(--c-ink-2)"/>
            <circle cx="30" cy="30" r="5.5" fill="var(--c-surface)" stroke="var(--c-border)" stroke-width="1.5"/>
            <circle cx="38" cy="22" r="5.5" fill="var(--c-brand)" opacity="0.7"/>
          </svg>
        </div>
        <span class="room-list__empty-text">${t('lobby.no_rooms')}</span>
        <span class="room-list__empty-sub">${t('lobby.no_rooms_sub')}</span>
      </div>
    `;
    return;
  }

  let html = `
    <table class="room-table">
      <thead>
        <tr>
          <th>${t('lobby.th_room')}</th>
          <th>${t('lobby.th_host')}</th>
          <th>${t('lobby.th_players')}</th>
          <th>${t('lobby.th_status')}</th>
          <th>${t('lobby.th_rules')}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
  `;

  let i = 0;
  for (const room of rooms) {
    const stateLabel = getStateLabel(room.state, room.playerCount);
    const stateClass = getStateClass(room.state, room.playerCount);
    const ruleTags   = buildRuleTags(room);

    const animDelay = (i * 0.05).toFixed(2);
    html += `
      <tr data-room-id="${room.roomId}" class="animate-fade-up" style="animation-delay: ${animDelay}s">
        <td>
          <div style="font-weight:600; color:var(--c-ink); margin-bottom:2px;">${escapeHtml(room.roomName || room.roomId)}</div>
          <span class="room-id" style="font-size:11px; font-weight:400; color:var(--c-ink-3);">ID: ${escapeHtml(room.roomId)}</span>
        </td>
        <td>${escapeHtml(room.hostName)}</td>
        <td>
          <span class="player-count ${room.playerCount >= 2 ? 'player-count--full' : 'player-count--open'}">
            ${room.playerCount}/2
          </span>
          <span style="color:var(--c-ink-3);font-size:11px;margin-left:4px">(${room.userCount})</span>
        </td>
        <td><span class="state-badge ${stateClass}">${stateLabel}</span></td>
        <td>${ruleTags}</td>
        <td>
          <button class="btn-join" onclick="joinRoom('${escapeAttr(room.roomId)}')" type="button">
            ${t('lobby.btn_join')}
          </button>
        </td>
      </tr>
    `;
    i++;
  }

  html += '</tbody></table>';
  roomListEl.innerHTML = html;
}

function getStateLabel(state, playerCount) {
  if (state === 'playing') return t('lobby.state_playing');
  if (state === 'interrupted') return t('lobby.state_interrupted');
  if (playerCount >= 2) return t('lobby.state_ready');
  return t('lobby.state_waiting');
}

function getStateClass(state, playerCount) {
  if (state === 'playing') return 'state-badge--playing';
  if (playerCount >= 2) return 'state-badge--waiting';
  return 'state-badge--idle';
}

function buildRuleTags(room) {
  let tags = '';
  tags += `<span style="color:var(--c-ink-3);font-size:12px">${room.boardSize}×${room.boardSize}</span> `;
  if (room.ruleWall) tags += '<span class="rule-tag rule-tag--wall">Wall</span>';
  if (room.rulePortal) tags += '<span class="rule-tag rule-tag--portal">Portal</span>';
  if (room.winningRule === 'standard') tags += `<span class="rule-tag" style="background:#eef0fb;color:#3a4bba;border:1px solid #ccd2f0;">${t('rule.standard')}</span>`;
  if (room.winningRule === 'caro') tags += `<span class="rule-tag" style="background:#e8f4fd;color:#1a6fa8;border:1px solid #b3d9f0;">${t('rule.caro')}</span>`;
  if (room.ruleSwap2) tags += '<span class="rule-tag" style="background:#eafaf0;color:#2c7a4b;border:1px solid #b6e0c6;">Swap2</span>';
  if (!room.ruleWall && !room.rulePortal && !room.ruleSwap2 && (room.winningRule || 'freestyle') === 'freestyle') tags += `<span style="color:var(--c-ink-3);font-size:11px">${t('lobby.rule_basic')}</span>`;
  return `<div class="rule-tags">${tags}</div>`;
}

window.addEventListener('langchange', () => {
  renderRoomList(currentRooms);
});

// ---------------------------------------------------------------------------
// Join Room
// ---------------------------------------------------------------------------
// Exposed globally for onclick
window.joinRoom = function(roomId) {
  // Store intent and navigate — room.js will handle the actual join
  sessionStorage.setItem('gvn_room_intent', JSON.stringify({ action: 'join', roomId }));
  window.location.href = `room.html?id=${encodeURIComponent(roomId)}`;
};

// ---------------------------------------------------------------------------
// Create Room Modal
// ---------------------------------------------------------------------------

function openModal() {
  modalOverlay.classList.add('visible');
}

function closeModal() {
  modalOverlay.classList.remove('visible');
}

btnCreate.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);

// Close modal on overlay click (but not on modal body click)
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('visible')) {
    closeModal();
  }
});

// Confirm → create room
modalConfirm.addEventListener('click', () => {
  const boardSize = parseInt(
    document.querySelector('input[name="boardSize"]:checked').value, 10
  );
  const timerMode = document.querySelector('input[name="timerMode"]:checked').value;
  const timerSeconds = parseInt(document.getElementById('timer-seconds').value, 10) || 60;
  const timerIncrementSeconds = parseInt(document.getElementById('timer-increment').value, 10) || 0;
  const winningRule     = (document.querySelector('input[name="winRule"]:checked') || {}).value || 'freestyle';
  const ruleSwap2       = (document.querySelector('input[name="openRule"]:checked') || {}).value === 'swap2';
  let   ruleWall        = document.getElementById('rule-wall').checked;
  let   rulePortal      = document.getElementById('rule-portal').checked;
  if (ruleSwap2) { ruleWall = false; rulePortal = false; } // Swap2 plays on a plain board
  const roomName        = document.getElementById('room-name').value.trim();

  // Store intent and navigate — room.js will handle the actual create
  sessionStorage.setItem('gvn_room_intent', JSON.stringify({
    action: 'create',
    settings: { roomName, boardSize, winningRule, ruleWall, rulePortal, ruleSwap2, timerMode, timerSeconds, timerIncrementSeconds },
  }));

  closeModal();
  window.location.href = 'room.html'; // Create room ID is assigned by server later
});

// Swap2 (opening rule) is played on a plain board → disable & clear board setup.
(function () {
  const sync = () => {
    const swap2 = document.getElementById('or-swap2');
    const disabled = !!(swap2 && swap2.checked);
    ['rule-wall', 'rule-portal'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (disabled) el.checked = false;
      el.disabled = disabled;
      const trow = el.closest('.toggle-row');
      if (trow) trow.style.opacity = disabled ? '0.45' : '';
    });
  };
  document.querySelectorAll('input[name="openRule"]').forEach(r => r.addEventListener('change', sync));
  sync();
})();

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}
