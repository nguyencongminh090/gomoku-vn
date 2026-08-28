'use strict';

/**
 * private-chat.js — 1-on-1 real-time private chat for lobby users (#159).
 *
 * Floating chat windows anchored to the bottom-right of the lobby, max 3 at a
 * time (opening a 4th evicts the oldest). Plus an "online users" modal with
 * client-side search and a Ctrl/⌘+K shortcut.
 *
 * Ephemeral: no history is persisted. Closing a window drops that conversation.
 *
 * Backend: server/socket/handlers/PrivateChatHandler.js
 *   emit  private_message:send    {toUserId, text}
 *   on    private_message:receive {messageId, fromUserId, fromUsername, text, timestamp}
 *   on    private_message:error   {code}
 *   on    user:status / user:disconnected  — a chat partner went offline
 */

import { client } from './lobby.js?v=164';

const MAX_WINDOWS = 3;
const TITLE_FLASH_MS = 1200;

const E = () => window.EscapeUtils;
const t = (k, v) => (window.t ? window.t(k, v) : k);
const decode = (txt) => (E() ? E().decodeChatText(txt) : txt);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** userId → { root, log, input, statusEl, seen:Set<messageId>, displayName } */
const windows = new Map();
/** ordered list of open userIds, oldest first (for eviction) */
const order = [];

let onlineUsers = [];               // [{ userId, displayName, isGuest }]

// Live view of the current user. `session:me` can arrive AFTER this module
// runs (see lobby.js), so a value captured once at init would stay null —
// read it fresh every time instead.
const me = {
  get userId()      { const u = window.GvnSession && window.GvnSession.getUser(); return u ? u.userId : null; },
  get displayName() { const u = window.GvnSession && window.GvnSession.getUser(); return u ? u.displayName : ''; },
};

let originalTitle = document.title;
let flashTimer = null;
let unread = 0;
let lastFlashSender = '';
let socketConnected = true;

let container, modal, modalList, modalSearch, modalShortcut, notifBtn;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOnline(userId) {
  return onlineUsers.some(u => u.userId === userId);
}

function displayNameFor(userId, fallback) {
  const u = onlineUsers.find(x => x.userId === userId);
  return (u && u.displayName) || fallback || userId;
}

function tabHidden() {
  return document.hidden || !document.hasFocus();
}

// ---------------------------------------------------------------------------
// Title flash (incoming message while tab is in the background)
// ---------------------------------------------------------------------------

function startTitleFlash(senderName, snippet) {
  unread += 1;
  lastFlashSender = senderName;
  if (flashTimer) return;
  const alt = `(${unread}) 💬 ${senderName}: ${snippet}`.slice(0, 80);
  let showAlt = true;
  flashTimer = setInterval(() => {
    document.title = showAlt
      ? `(${unread}) 💬 ${lastFlashSender}`
      : originalTitle;
    showAlt = !showAlt;
  }, TITLE_FLASH_MS);
  document.title = alt;
}

function clearTitleFlash() {
  if (flashTimer) {
    clearInterval(flashTimer);
    flashTimer = null;
  }
  unread = 0;
  document.title = originalTitle;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

function canNotify() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

function showNotification(fromUserId, senderName, text) {
  if (!canNotify() || !tabHidden()) return;
  try {
    const n = new Notification(`${t('private_chat.notif_from')} ${senderName}`, {
      body: text,
      tag: 'pm-' + fromUserId,
    });
    n.onclick = () => {
      window.focus();
      openChat(fromUserId);
      n.close();
    };
  } catch (_) { /* Notification constructor can throw on some platforms */ }
}

function renderNotifButton() {
  if (!notifBtn) return;
  const perm = (typeof Notification !== 'undefined') ? Notification.permission : 'denied';
  notifBtn.hidden = (typeof Notification === 'undefined');
  notifBtn.title = '';

  const label = notifBtn.querySelector('.online-users-notif-btn__label');
  const iconUse = notifBtn.querySelector('.icon use');
  const setIcon = (id) => {
    if (iconUse) iconUse.setAttribute('href', 'assets/icons/phosphor-sprite.svg?v=164#' + id);
  };

  if (perm === 'granted') {
    if (label) label.textContent = t('private_chat.notif_enabled');
    setIcon('ph-regular-bell');
    notifBtn.dataset.state = 'on';
    notifBtn.disabled = true;
  } else if (perm === 'denied') {
    if (label) label.textContent = t('private_chat.notif_blocked');
    setIcon('ph-regular-bell-slash');
    notifBtn.dataset.state = 'blocked';
    notifBtn.title = t('private_chat.notif_blocked');
    notifBtn.disabled = true;
  } else {
    if (label) label.textContent = t('private_chat.notif_enable');
    setIcon('ph-regular-bell');
    notifBtn.dataset.state = 'default';
    notifBtn.disabled = false;
  }
}

function requestNotifPermission() {
  if (typeof Notification === 'undefined') return;
  try {
    const p = Notification.requestPermission(renderNotifButton);
    if (p && typeof p.then === 'function') p.then(renderNotifButton).catch(() => {});
  } catch (_) { /* legacy callback-only Safari already handled above */ }
}

// ---------------------------------------------------------------------------
// Chat windows
// ---------------------------------------------------------------------------

function updateWindowStatus(userId) {
  const w = windows.get(userId);
  if (!w) return;
  const online = isOnline(userId);
  w.statusEl.textContent = online ? t('private_chat.user_online') : t('private_chat.user_offline');
  w.statusEl.classList.toggle('is-offline', !online);

  const disabled = !online || !socketConnected;
  w.input.disabled = disabled;
  w.sendBtn.disabled = disabled;
  w.notice.hidden = online && socketConnected;
  w.notice.textContent = !socketConnected
    ? t('private_chat.user_disconnected')
    : t('private_chat.status_offline');
}

function appendMessage(userId, msg, isSelf) {
  const w = windows.get(userId);
  if (!w) return;
  if (msg.messageId) {
    if (w.seen.has(msg.messageId)) return;
    w.seen.add(msg.messageId);
  }
  const row = document.createElement('div');
  row.className = 'pm-msg' + (isSelf ? ' pm-msg--self' : '');
  const bubble = document.createElement('span');
  bubble.className = 'pm-msg__bubble';
  bubble.textContent = decode(msg.text);
  row.appendChild(bubble);
  w.log.appendChild(row);
  w.log.scrollTop = w.log.scrollHeight;
}

function buildWindow(userId, name) {
  const root = document.createElement('div');
  root.className = 'pm-window';
  root.dataset.peerId = userId;
  root.innerHTML = `
    <div class="pm-window__header">
      <svg class="icon pm-window__icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg?v=164#ph-bold-chat-circle"></use></svg>
      <span class="pm-window__name"></span>
      <span class="pm-window__status"></span>
      <button type="button" class="pm-window__close" aria-label="${E().escapeAttr(t('private_chat.close'))}">✕</button>
    </div>
    <div class="pm-window__log"></div>
    <div class="pm-notice" hidden></div>
    <div class="chat-input pm-input-row">
      <input type="text" class="pm-input" maxlength="500" autocomplete="off"
             placeholder="${E().escapeAttr(t('private_chat.ph_input'))}" />
      <button type="button" class="pm-send-btn" title="${E().escapeAttr(t('private_chat.btn_send'))}" aria-label="${E().escapeAttr(t('private_chat.btn_send'))}">
        <svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg?v=164#ph-bold-paper-plane-tilt"></use></svg>
      </button>
    </div>`;

  root.querySelector('.pm-window__name').textContent = name;
  const w = {
    root,
    log: root.querySelector('.pm-window__log'),
    input: root.querySelector('.pm-input'),
    sendBtn: root.querySelector('.pm-send-btn'),
    statusEl: root.querySelector('.pm-window__status'),
    notice: root.querySelector('.pm-notice'),
    seen: new Set(),
    displayName: name,
  };

  const send = () => {
    const text = w.input.value.trim();
    if (!text || w.input.disabled) return;
    const filtered = window.ProfanityFilter ? window.ProfanityFilter.filterMessage(text) : text;
    client.emit('private_message:send', { toUserId: userId, text: filtered });
    w.input.value = '';
  };
  w.sendBtn.addEventListener('click', send);
  w.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  root.querySelector('.pm-window__close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeChat(userId);
  });
  root.querySelector('.pm-window__header').addEventListener('click', (e) => {
    if (e.target.closest('.pm-window__close') || e.target.closest('.pm-input-row')) return;
    root.classList.toggle('pm-window--collapsed');
  });

  return w;
}

function openChat(userId) {
  if (!userId || userId === me.userId) return;
  let w = windows.get(userId);
  if (w) {
    w.root.classList.remove('pm-window--collapsed');
    w.input.focus();
    return;
  }
  if (order.length >= MAX_WINDOWS) {
    closeChat(order[0]);
  }
  const name = displayNameFor(userId);
  w = buildWindow(userId, name);
  windows.set(userId, w);
  order.push(userId);
  container.appendChild(w.root);
  updateWindowStatus(userId);
  w.input.focus();
}

function closeChat(userId) {
  const w = windows.get(userId);
  if (!w) return;
  w.root.remove();
  windows.delete(userId);
  const i = order.indexOf(userId);
  if (i !== -1) order.splice(i, 1);
}

// ---------------------------------------------------------------------------
// Online-users modal
// ---------------------------------------------------------------------------

/** Two-letter initials for the avatar circle. */
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic hue (0–359) from a string, for the avatar background. */
function hueOf(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

function renderModalList() {
  if (!modalList) return;
  const q = (modalSearch.value || '').trim().toLowerCase();
  const rows = onlineUsers.filter(u => !q || u.displayName.toLowerCase().includes(q));

  const countEl = document.getElementById('online-users-count');
  if (countEl) countEl.textContent = String(onlineUsers.length);

  modalList.innerHTML = '';

  if (rows.length === 0) {
    const li = document.createElement('li');
    li.className = 'online-users-list__empty';
    li.textContent = t('private_chat.no_users_found');
    modalList.appendChild(li);
    return;
  }

  for (const u of rows) {
    const isSelf = u.userId === me.userId;
    const li = document.createElement('li');
    li.className = 'online-users-list__row' + (isSelf ? ' is-self' : '');

    const avatar = document.createElement('span');
    avatar.className = 'online-users-list__avatar';
    avatar.style.setProperty('--h', hueOf(u.userId || u.displayName));
    avatar.textContent = initials(u.displayName);
    li.appendChild(avatar);

    const nameWrap = document.createElement('span');
    nameWrap.className = 'online-users-list__name-wrap';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'online-users-list__name';
    nameSpan.textContent = u.displayName;
    nameWrap.appendChild(nameSpan);
    if (isSelf) {
      const you = document.createElement('span');
      you.className = 'online-users-list__tag';
      you.textContent = t('private_chat.you');
      nameWrap.appendChild(you);
    } else if (u.isGuest) {
      const g = document.createElement('span');
      g.className = 'online-users-list__tag';
      g.textContent = t('nav.guest_badge');
      nameWrap.appendChild(g);
    }
    const meta = document.createElement('span');
    meta.className = 'online-users-list__meta';
    meta.textContent = t('private_chat.status_in_lobby');
    nameWrap.appendChild(meta);
    li.appendChild(nameWrap);

    if (!isSelf) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'online-users-list__chat-btn';
      btn.title = t('private_chat.btn_chat');
      btn.setAttribute('aria-label', t('private_chat.btn_chat') + ' — ' + u.displayName);
      btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="assets/icons/phosphor-sprite.svg?v=164#ph-bold-chat-circle"></use></svg>';
      li.appendChild(btn);
      // The whole row (except its own controls) opens the chat.
      const open = () => { openChat(u.userId); closeModal(); };
      btn.addEventListener('click', (e) => { e.stopPropagation(); open(); });
      li.addEventListener('click', open);
      li.setAttribute('role', 'button');
      li.tabIndex = 0;
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    }
    modalList.appendChild(li);
  }
}

function openModal() {
  if (!modal) return;
  modal.classList.add('visible');
  renderModalList();
  renderNotifButton();
  modalSearch.focus();
  modalSearch.select();
}

function closeModal() {
  if (modal) modal.classList.remove('visible');
}

function toggleModal() {
  if (modal && modal.classList.contains('visible')) closeModal();
  else openModal();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function updateOnlineUsers(users) {
  onlineUsers = Array.isArray(users) ? users : [];
  for (const userId of windows.keys()) updateWindowStatus(userId);
  if (modal && modal.classList.contains('visible')) renderModalList();
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function handleIncoming(msg) {
  const isSelf = msg.fromUserId === me.userId;
  // `conversationWith` is the peer for whichever side received this copy.
  const peerId = msg.conversationWith || (isSelf ? null : msg.fromUserId);
  if (!peerId) return;

  if (isSelf) {
    // Echo of our own outgoing message — the window is already open (send()
    // path opened it). Just append; dedupe by messageId guards double-adds.
    appendMessage(peerId, msg, true);
    return;
  }

  if (!windows.has(peerId)) openChat(peerId);
  appendMessage(peerId, msg, false);

  if (window.audioManager && typeof window.audioManager.playMessageSound === 'function') {
    window.audioManager.playMessageSound();
  }
  const snippet = decode(msg.text).slice(0, 40);
  if (tabHidden()) {
    startTitleFlash(msg.fromUsername || displayNameFor(peerId), snippet);
    showNotification(peerId, msg.fromUsername || displayNameFor(peerId), decode(msg.text));
  }
}

function applyLang() {
  renderNotifButton();
  if (modalSearch) modalSearch.placeholder = t('private_chat.modal_search_ph');
  if (modalShortcut) {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');
    modalShortcut.textContent = isMac ? '⌘K' : 'Ctrl K';
  }
  for (const [userId, w] of windows) {
    w.input.placeholder = t('private_chat.ph_input');
    w.sendBtn.title = t('private_chat.btn_send');
    w.sendBtn.setAttribute('aria-label', t('private_chat.btn_send'));
    updateWindowStatus(userId);
  }
  if (modal && modal.classList.contains('visible')) renderModalList();
}

function init() {
  container      = document.getElementById('private-chat-container');
  modal          = document.getElementById('modal-online-users');
  modalList      = document.getElementById('online-users-list');
  modalSearch    = document.getElementById('online-users-search');
  modalShortcut  = document.querySelector('.online-users-search-shortcut');
  notifBtn       = document.getElementById('btn-notif-enable');
  if (!container || !modal) return;

  originalTitle = document.title;

  const closeBtn = document.getElementById('modal-online-users-close');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  modalSearch.addEventListener('input', renderModalList);
  if (notifBtn) notifBtn.addEventListener('click', () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') requestNotifPermission();
  });

  // Ctrl/⌘-K toggles the modal. Registered in the capture phase and keyed on
  // e.code as well as e.key so a stray browser default or a layout quirk
  // can't swallow it.
  window.addEventListener('keydown', (e) => {
    const isK = e.code === 'KeyK' || e.key === 'k' || e.key === 'K';
    if ((e.ctrlKey || e.metaKey) && !e.altKey && isK) {
      e.preventDefault();
      toggleModal();
      return;
    }
    if (e.key === 'Escape' && modal.classList.contains('visible')) closeModal();
  }, true);

  // The "Đang online · N" label is always present — make it the discoverable,
  // click-anywhere way into the online-users list (Ctrl/⌘-K stays as the
  // shortcut). Without this, a lobby with only a handful of people online has
  // no visible affordance at all.
  const onlineTitle = document.querySelector('#online-line .online-line__title');
  if (onlineTitle) {
    onlineTitle.setAttribute('role', 'button');
    onlineTitle.setAttribute('tabindex', '0');
    onlineTitle.classList.add('online-line__title--action');
    onlineTitle.addEventListener('click', openModal);
    onlineTitle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); }
    });
  }

  // Delegated interaction on the lobby online line ONLY: a name opens a chat,
  // the "…and N others" affordance opens the full modal. Scoped to
  // #online-line-names so it can never match the [data-peer-id] on a chat
  // window root (that collision reopened a window the moment its ✕ was
  // clicked). Both targets are role="button" spans → keyboard works too.
  const onlineLine = document.getElementById('online-line-names');
  const onlineLineAction = (e) => {
    const el = e.target.closest && e.target.closest('[data-user-id], [data-open-users]');
    if (!el || !onlineLine || !onlineLine.contains(el)) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (el.hasAttribute('data-open-users')) { openModal(); return; }
    const uid = el.getAttribute('data-user-id');
    if (uid) openChat(uid);
  };
  if (onlineLine) {
    onlineLine.addEventListener('click', onlineLineAction);
    onlineLine.addEventListener('keydown', onlineLineAction);
  }

  const restoreFocus = () => { if (!tabHidden()) clearTitleFlash(); };
  window.addEventListener('focus', restoreFocus);
  document.addEventListener('visibilitychange', restoreFocus);

  client.on('private_message:receive', handleIncoming);
  client.on('private_message:error', (data) => {
    const code = (data && data.code ? data.code : 'generic_error').toLowerCase();
    alert(t('err.' + code));
  });
  const partnerOffline = (data) => {
    if (data && data.userId) {
      onlineUsers = onlineUsers.filter(u => u.userId !== data.userId);
      updateWindowStatus(data.userId);
      if (modal.classList.contains('visible')) renderModalList();
    }
  };
  client.on('user:status', (d) => { if (d && d.status === 'offline') partnerOffline(d); });
  client.on('user:disconnected', partnerOffline);

  client.on('connect', () => { socketConnected = true; for (const uid of windows.keys()) updateWindowStatus(uid); });
  client.on('disconnect', () => { socketConnected = false; for (const uid of windows.keys()) updateWindowStatus(uid); });

  window.addEventListener('langchange', applyLang);
  applyLang();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

window.PrivateChat = { init, openChat, closeChat, openUsersModal: openModal, updateOnlineUsers };
