'use strict';

/**
 * lobby.js — Lobby UI controller.
 *
 * Responsibilities:
 *   - Render live room list from server
 *   - Create room modal (collect settings → emit room:create)
 *   - Join room (emit room:join → redirect to room page)
 *   - Display user info in the nav
 *
 * Logout now lives in the global Settings panel (see settings-panel.js).
 *
 * Manual test checklist:
 *   [ ] No token → redirect to login
 *   [ ] Room list renders on lobby:update
 *   [ ] Empty state shows "Chưa có phòng nào"
 *   [ ] Create room modal opens/closes
 *   [ ] room:create emits correct settings payload
 *   [ ] room:joined → stores roomId → redirects to room.html
 *   [ ] room:error shows alert
 */

// ---------------------------------------------------------------------------
// Auth guard: redirect if no token
// ---------------------------------------------------------------------------
(function authGuard() {
  // Optimistic: the credential is an HttpOnly cookie now (TODO.md #68), so
  // this cannot verify it — it only rules out "definitely signed out". The
  // socket handshake is the real check.
  window.GvnSession.requireAuth();
})();

// ---------------------------------------------------------------------------
// Initialize Socket.io client
// ---------------------------------------------------------------------------
// Exported so tournaments.js can reuse this exact connection instead of
// opening a second socket.io connection from the same page (which would
// also self-evict via the server's single-device-per-token enforcement).
//
// `shared()` rather than `new` since #145: index.html now creates this client
// in <head> (socket-early.js) so the handshake overlaps HTML parsing instead
// of queueing behind the whole module graph. By the time this line runs the
// socket is normally already connecting, and `shared()` hands back that same
// client. `new` here would open a second connection and kick the player.
export const client = SocketClient.shared();

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const statusBanner  = document.getElementById('status-banner');
const navUser       = document.getElementById('nav-user');
const navBadge      = document.getElementById('nav-badge');
const roomListEl    = document.getElementById('room-list');
const heroEyebrow   = document.getElementById('hero-eyebrow');
const heroSub       = document.getElementById('hero-sub');
const heroTitle     = document.getElementById('hero-title');
const modalOverlay  = document.getElementById('modal-create');
const modalClose    = document.getElementById('modal-close');
const modalCancel   = document.getElementById('modal-cancel');
const modalConfirm  = document.getElementById('modal-confirm');
const btnQuickMatch = document.getElementById('btn-quick-match');
const modalAdvancedToggle = document.getElementById('modal-advanced-toggle');
let currentRooms = [];

// ---------------------------------------------------------------------------
// Display user info in nav
// ---------------------------------------------------------------------------
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
// Site-wide Arena header (B193); it owns the user chip the old topnav showed.
if (window.PlatformShell) window.PlatformShell.build('lobby');
if (userInfo.signedIn && navUser && navBadge) {
  navUser.textContent = userInfo.displayName;
  navBadge.textContent = userInfo.isGuest ? t('nav.guest_badge') : '';
  navBadge.style.display = userInfo.isGuest ? '' : 'none';
}

// Bind status banner
client.bindStatusBanner(statusBanner);

// ---------------------------------------------------------------------------
// Subscribe to lobby updates
// ---------------------------------------------------------------------------
// B229: lobby:subscribe / unsubscribe (and the B228 reconnect re-subscribe) live in lobby-home.js —
// the lobby room is joined only while the rooms screen is showing.

// Local room map, keyed by roomId — the base that `lobby:patch` applies to.
// A Map keeps insertion order and, importantly, keeps an updated entry in its
// existing position rather than moving it to the end, so a room does not jump
// around the list every time someone sits down in it.
let roomMap = new Map();

function renderFromMap() {
  currentRooms = Array.from(roomMap.values());
  renderRoomList(currentRooms);
  renderHero();
}

// ── #364 hero counts + tab counts ───────────────────────────────────────────
// Watchers = people in a room who are not seated (userCount already drops ghost viewers, #158).
const watchersOf = (room) => Math.max(0, (room.userCount || 0) - (room.playerCount || 0));
// Write only on change: the hero counts sit in an aria-live region and patches arrive every 2.5 s during play.
const setNum = (id, n) => { const el = document.getElementById(id); if (el && el.textContent !== String(n)) el.textContent = String(n); };
function renderRoomStats() {
  const rooms = currentRooms;
  const open = rooms.filter((r) => r.state !== 'playing' && r.playerCount < 2).length;
  setNum('rh-n-open', open);
  setNum('rh-n-live', rooms.filter((r) => r.state === 'playing').length);
  setNum('rh-n-watch', rooms.reduce((a, r) => a + watchersOf(r), 0));
  setNum('room-n-playing', rooms.filter((r) => r.state === 'playing').length); // "Đang chơi · N" (user 2026-11-13: one label instead of Phòng/Bàn/Quan sát)
}

// ---------------------------------------------------------------------------
// Hero line
// ---------------------------------------------------------------------------
// A fixed screen title (H1, as in the Arena mockup) plus one live sentence under it, stating
// what is actually on the screen — it replaced the old "Danh sách phòng (N)" header plus its
// count pills. (The sentence used to BE the H1, so an empty lobby read "Chưa có bàn chơi nào
// đang mở." as the page title, #209/B210.) Which
// sentence depends on the active tab, so tournaments.js drives it through the
// two exports below rather than owning a hero of its own.

let heroTab = 'tables';          // 'home' | 'tables' | 'tournaments'
let heroTournamentCount = 0;

/** Home greeting, "Chào <b>name</b>, …": the name is user text, so it goes in as a text node. */
function renderGreeting() {
  heroEyebrow.textContent = t('home.eyebrow');
  if (heroSub) heroSub.hidden = true;
  const name = userInfo.signedIn ? userInfo.displayName : '';
  if (!name) { heroTitle.textContent = t('home.greeting_anon'); return; }
  const [before, after = ''] = t('home.greeting', { name: '\u0000' }).split('\u0000');
  const b = document.createElement('b');
  b.textContent = name;
  heroTitle.replaceChildren(before, b, after);
}

function renderHero() {
  renderRoomStats(); // #364: every room-list change ends here (snapshot, patch, langchange)
  if (!heroTitle) return;
  if (heroTab === 'home') { renderGreeting(); return; }
  const tournaments = heroTab === 'tournaments';
  const n = tournaments ? heroTournamentCount : currentRooms.length;

  heroEyebrow.textContent = t(tournaments ? 'lobby.eyebrow_tournaments' : 'lobby.eyebrow_tables');

  heroTitle.textContent = t(tournaments ? 'lobby.title_tournaments' : 'lobby.title_rooms');
  if (!heroSub) return;
  if (!tournaments) { heroSub.hidden = true; return; } // Arena rooms screen: title only, the list is the count
  heroSub.hidden = false;
  if (n === 0) {
    heroSub.textContent = t(tournaments ? 'lobby.hero_tournaments_empty' : 'lobby.hero_rooms_empty');
    return;
  }
  // Both templates carry a single `{n}`, which is filled with a bolded count.
  // The template is a translator-authored constant and `n` is a number, so no
  // user-controlled text ever reaches this innerHTML.
  const key = tournaments ? 'lobby.hero_tournaments' : 'lobby.hero_rooms';
  heroSub.innerHTML = t(key, { n: `<b>${n}</b>` });
}

/** Called by lobby-home.js on screen switch, so the hero follows the screen. */
export function setHeroTab(tab) {
  heroTab = tab;
  renderHero();
}

/** Called by tournaments.js whenever its list changes. */
export function setHeroTournamentCount(count) {
  heroTournamentCount = count;
  if (heroTab === 'tournaments') renderHero();
}

// Paint the empty-state sentence immediately rather than leaving the hero
// blank until the first lobby:update lands.
renderHero();

// Full snapshot — sent once on subscribe, and again on every reconnect, since
// the client re-subscribes. Replaces the local map wholesale.
// Server clock − local clock, from the lobby envelopes (#364): `startedAt` is a server epoch, so a
// visitor whose clock is off by minutes must not see "Đang đấu · 07:12" on a game that just began.
let serverClockOffset = 0;
function noteServerTime(data) {
  if (data && Number.isFinite(data.serverTime)) serverClockOffset = data.serverTime - Date.now();
}

client.on('lobby:update', (data) => {
  noteServerTime(data);
  roomMap = new Map((data.rooms || []).map(r => [r.roomId, r]));
  renderFromMap();
});

// Delta — only the rooms that actually changed, plus the ids of rooms that are
// gone. Removals are applied before upserts so a room destroyed and recreated
// with the same id inside one debounce window ends up present, not missing.
// Both operations are idempotent: re-applying an entry already held, or
// removing an id never held, changes nothing.
//
// Applied incrementally to the existing DOM (B117) instead of going through
// renderFromMap()/renderRoomList(): a busy lobby fires many small patches, and
// rebuilding every row's innerHTML — plus replaying every row's entrance
// animation — on each one scales with the *total* room count instead of the
// (usually 1-2) rooms that actually changed.
client.on('lobby:patch', (data) => {
  noteServerTime(data);
  applyLobbyPatch(data);
});

// ── Online Users ────────────────────────────────────────────────────────────
// The sticky sidebar panel is gone (Zen Minimal single column): who is here is
// now the count in the top bar plus one line of prose under the room list.
const onlineCountEl     = document.getElementById('online-count');
const onlineLineEl      = document.getElementById('online-line');
const onlineLineCountEl = document.getElementById('online-line-count');
const onlineLineNamesEl = document.getElementById('online-line-names');

// How many names the line spells out before it summarises the rest (#253).
const ONLINE_NAME_LIMIT = 6;

let currentOnlineUsers = [];

function renderOnlineLine() {
  if (!onlineLineEl) return;
  const users = currentOnlineUsers;
  const count = users.length;

  if (onlineCountEl) onlineCountEl.textContent = t('lobby.online_count_nav', { n: count });
  if (onlineLineCountEl) onlineLineCountEl.textContent = count;
  setNum('rh-n-online', count);
  onlineLineEl.hidden = false;
  if (count === 0) {
    onlineLineNamesEl.textContent = t('lobby.no_one_online');
    return;
  }

  const limit  = ONLINE_NAME_LIMIT;
  const shown  = users.slice(0, limit);
  const hidden = count - shown.length;
  // #364: faces only (user 2026-11-13 — the names line was redundant next to the avatars). Each
  // avatar is still the PM control (#159, [data-user-id] → private-chat.js); its name is the
  // tooltip + accessible name. Your own face is not a button. "+N" opens the full list.
  const avatar = (u) => (window.PlatformShell ? window.PlatformShell.avatar(u.avatarUrl, u.displayName, 'pav--sm').outerHTML : '');
  const parts = shown.map((u) => {
    const name = escapeAttr(u.displayName);
    if (u.userId === userInfo.userId) return `<span class="online-av online-av--me" title="${name}">${avatar(u)}</span>`;
    return `<span class="online-name online-av" role="button" tabindex="0" data-user-id="${escapeAttr(u.userId)}" title="${name}" aria-label="${name}">${avatar(u)}</span>`;
  });
  if (hidden > 0) parts.push(`<span class="online-name online-line__more" role="button" tabindex="0" data-open-users title="${escapeAttr(t('lobby.online_more', { n: hidden }))}">+${hidden}</span>`);
  onlineLineNamesEl.innerHTML = parts.join('');
}

// Apply a `lobby:online_patch` ({ joined, left }) to an online list (#230).
// Idempotent: a `joined` entry already held is replaced, a `left` id never
// held is ignored — a snapshot taken between flushes may already include it.
function applyOnlineUsersPatch(users, patch) {
  const byId = new Map(users.map((u) => [u.userId, u]));
  for (const userId of (patch && patch.left) || []) byId.delete(userId);
  for (const u of (patch && patch.joined) || []) byId.set(u.userId, u);
  return [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function setOnlineUsers(users) {
  currentOnlineUsers = users;
  renderOnlineLine();
  // Feed the private-chat module (#159) — it owns the online-users modal and
  // per-window presence. Safe if it hasn't finished init yet: it also reads
  // GvnSession directly and this event re-fires on every presence change.
  if (window.PrivateChat) window.PrivateChat.updateOnlineUsers(users);
}

// Full list once per lobby:subscribe (incl. after reconnect, #228), then deltas.
client.on('lobby:online_users', (users) => setOnlineUsers(Array.isArray(users) ? users : []));
client.on('lobby:online_patch', (patch) => setOnlineUsers(applyOnlineUsersPatch(currentOnlineUsers, patch)));

client.on('room:error', (data) => {
  // `code` is language-neutral; `message` is Vietnamese-only fallback for
  // servers/events that haven't been given a code yet (TODO #45).
  alert(data.code ? t('err.' + data.code.toLowerCase()) : data.message);
});

// Auto-redirect if server detects we are already in a room
client.on('room:joined', (data) => {
  window.location.replace(roomHref(data.roomId));
});

// room.html URL; entering from the Phòng tab adds ?from=rooms so leaving returns there (#365).
function roomHref(roomId) {
  const q = new URLSearchParams();
  if (roomId) q.set('id', roomId);
  if (window.location.hash === '#rooms') q.set('from', 'rooms');
  const qs = q.toString();
  return 'room.html' + (qs ? '?' + qs : '');
}

// ---------------------------------------------------------------------------
// Room List Rendering
// ---------------------------------------------------------------------------

// #364 R1 "Sảnh gỗ": a room is a TABLE CARD — mini board on top (the live position, or an empty
// board with "Ngồi vào" for an open seat), state flag + elapsed time, watchers, then the players
// (avatar · name · rating) and the meta tags. The whole card is the join/watch control (B219);
// `.room-row` stays as the hook e2e specs and the keyboard handler use.
// `animate` staggers the entrance animation by `delayIndex` (full render); a card created by a
// patch passes delayIndex 0. An in-place update (updateRoomRowNode) never replays it.
function buildRoomRowHtml(room, { animate = false, delayIndex = 0 } = {}) {
  const animClass = animate ? ' animate-fade-up' : '';
  const animStyle = animate ? ` style="animation-delay: ${(delayIndex * 0.04).toFixed(2)}s"` : '';
  return `
    <div class="${cardClass(room)}${animClass}" data-room-id="${escapeAttr(room.roomId)}" data-action="joinRoom" data-arg="${escapeAttr(room.roomId)}"
         role="button" tabindex="0" aria-label="${escapeAttr(rowActionLabel(room))}"${animStyle}>${buildRoomCardInner(room)}</div>
  `;
}

/** 'live' (game running), 'open' (a seat to take), 'ready' (both seated, not started). */
function cardKind(room) {
  if (room.state === 'playing') return 'live';
  return room.playerCount >= 2 ? 'ready' : 'open';
}
function cardClass(room) { return `room-row rcard rcard--${cardKind(room)}`; }

function buildRoomCardInner(room) {
  const kind = cardKind(room);
  const watchers = watchersOf(room);
  const eye = window.PlatformShell ? window.PlatformShell.icon('ph-regular-eye').outerHTML : '';
  const flag = kind === 'live'
    ? `<i class="rcard__dot"></i>${escapeHtml(t('lobby.card_live'))}${room.startedAt ? `<span class="rcard__el" data-started="${Number(room.startedAt)}"> · ${formatElapsed(room.startedAt)}</span>` : ''}`
    : escapeHtml(t(kind === 'open' ? 'lobby.card_open' : 'lobby.state_ready'));
  return `
      <div class="rcard__board">
        ${miniBoardSvg(room.boardSize, kind === 'live' ? room.moves : null)}
        <span class="rcard__flag">${flag}</span>
        ${watchers ? `<span class="rcard__eye" title="${escapeAttr(t('lobby.card_watchers', { n: watchers }))}">${eye}${watchers}</span>` : ''}
        ${kind === 'open' ? `<span class="rcard__sit">${escapeHtml(t('lobby.card_sit'))}</span>` : ''}
      </div>
      <div class="rcard__body">
        <div class="room-row__name">${buildRoomPlayers(room)}</div>
        <div class="room-row__meta">${buildRoomMeta(room)}</div>
      </div>`;
}

/** "mm:ss" (or "h:mm:ss") since a server epoch; '' for a bad stamp. */
function formatElapsed(startedAt) {
  const sec = Math.max(0, Math.floor((Date.now() + serverClockOffset - Number(startedAt)) / 1000));
  if (!Number.isFinite(sec)) return '';
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, ss = sec % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(ss)}` : `${two(m)}:${two(ss)}`;
}
// One ticker for every live card's elapsed time; idle when the rooms screen is not showing.
setInterval(() => {
  if (document.hidden || !roomListEl.offsetParent) return;
  for (const el of roomListEl.querySelectorAll('.rcard__el[data-started]')) el.textContent = ' · ' + formatElapsed(el.dataset.started);
}, 1000);

// Lobby mini board (#364): a small static SVG of the live position — NOT BoardRenderer (board lock).
// `moves` is the flat [x0,y0,x1,y1,…] list from listRooms(), black first, alternating; the last
// stone gets a ring. null/[] → empty board. Grid paths are cached per size.
const _gridCache = new Map();
function miniBoardSvg(size, moves) {
  const n = Number(size) > 0 && Number(size) <= 25 ? Number(size) : 15;
  let grid = _gridCache.get(n);
  if (!grid) {
    let d = '';
    for (let i = 0; i < n; i++) d += `M.5 ${i + .5}H${n - .5}M${i + .5} .5V${n - .5}`;
    grid = `<rect class="mb__bg" width="${n}" height="${n}" rx=".4"/><path class="mb__grid" d="${d}"/>`;
    _gridCache.set(n, grid);
  }
  let stones = '';
  const list = Array.isArray(moves) ? moves : [];
  let lx = -1, ly = -1;
  for (let i = 0; i + 1 < list.length; i += 2) {
    const x = Number(list[i]), y = Number(list[i + 1]);
    if (!(x >= 0 && y >= 0 && x < n && y < n)) continue;
    stones += `<circle class="${(i / 2) % 2 ? 'mb__w' : 'mb__b'}" cx="${x + .5}" cy="${y + .5}" r=".42"/>`;
    lx = x; ly = y;
  }
  const last = lx >= 0 ? `<circle class="mb__last" cx="${lx + .5}" cy="${ly + .5}" r=".2"/>` : '';
  return `<svg class="mb" viewBox="0 0 ${n} ${n}" aria-hidden="true" focusable="false">${grid}${stones}${last}</svg>`;
}

// The ghost card at the start of the grid is the screen's only create-room entry (user 2026-11-13:
// "Tạo phòng và Mở bàn mới là giống nhau"), so it carries the #btn-create id e2e specs click.
const NEW_CARD_HTML = () => `<button type="button" class="rcard-new" id="btn-create" data-create-room><span class="rcard-new__plus">${window.PlatformShell ? window.PlatformShell.icon('ph-regular-plus-circle').outerHTML : '+'}</span><span>${escapeHtml(t('lobby.rh_new_table'))}</span></button>`;
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('[data-create-room]')) openModal();
});

// Full rebuild — used for the initial/reconnect snapshot (lobby:update) and
// for langchange, where every row's text genuinely needs to be
// redone. NOT used for lobby:patch — see applyLobbyPatch below.
function renderRoomList(allRooms) {
  const rooms = allRooms;
  if (rooms.length === 0) {
    roomListEl.innerHTML = `
      <div class="room-list__empty">
        <span class="room-list__empty-text">${t('lobby.no_rooms')}</span>
        <span class="room-list__empty-sub">${t('lobby.no_rooms_sub')}</span>
      </div>
    ` + NEW_CARD_HTML();
    return;
  }

  let html = '';
  let i = 0;
  for (const room of rooms) {
    html += buildRoomRowHtml(room, { animate: true, delayIndex: i });
    i++;
  }

  roomListEl.innerHTML = NEW_CARD_HTML() + html; // create first: it is the only create entry, never buried under 16 rooms
}

// Update an existing row's content in place — no DOM node replacement, no
// entrance-animation replay.
function updateRoomRowNode(node, room) {
  node.className = cardClass(room);
  node.innerHTML = buildRoomCardInner(room);
  node.setAttribute('aria-label', rowActionLabel(room));
}

// The whole ticket is the join/watch control (no button); keyboard users get Enter/Space.
function rowActionLabel(room) {
  return `${t(canWatch(room) ? 'lobby.btn_watch' : 'lobby.btn_join')}: ${room.roomName || room.roomId}`;
}
document.addEventListener('keydown', (e) => {
  const row = e.target.closest && e.target.closest('.room-row[data-action]');
  if (!row || e.target !== row || (e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  window.joinRoom(row.dataset.arg);
});

// Ticket title: both seated players (avatar + name), "A vs B"; an empty seat reads as a muted placeholder.
// A room nobody sits in yet falls back to its own name.
function buildRoomPlayers(room) {
  const seats = Array.isArray(room.players) ? room.players : [null, null];
  if (!seats[0] && !seats[1]) return escapeHtml(room.roomName || room.roomId);
  const seat = (p) => {
    if (!p) return `<span class="rplayer rplayer--empty">${escapeHtml(t('lobby.seat_empty'))}</span>`;
    const av = window.PlatformShell ? window.PlatformShell.avatar(p.avatarUrl, p.displayName, 'pav--xs').outerHTML : '';
    const rating = Number.isFinite(p.rating) ? `<small class="rplayer__rating">${p.rating}${p.provisional ? '?' : ''}</small>` : ''; // '?' = provisional, as on profile / user card
    return `<span class="rplayer">${av}<span class="rplayer__who"><span class="rplayer__name">${escapeHtml(p.displayName)}</span>${rating}</span></span>`;
  };
  return `${seat(seats[0])}<span class="rvs">vs</span>${seat(seats[1])}`;
}

// Apply a `lobby:patch` ({ upserts, removed }) to `roomMap` and the DOM
// incrementally: only the rows that actually changed are touched, instead of
// rebuilding the whole list (B117 — a busy lobby was re-rendering every room
// on every patch, scaling with total room count instead of changed-room
// count). Crossing the empty <-> non-empty boundary changes the DOM's overall
// shape (empty-state markup vs. row list), so that one edge still falls back
// to a full render — it happens at most once per transition, not per patch.
function applyLobbyPatch(patch) {
  const removed = patch.removed || [];
  const upserts = patch.upserts || [];

  for (const roomId of removed) roomMap.delete(roomId);
  for (const room of upserts) roomMap.set(room.roomId, room);
  currentRooms = Array.from(roomMap.values());

  // Crossing the empty <-> non-empty boundary swaps the empty-state markup for cards, so that edge
  // (only) re-renders in full. Everything else is incremental (#364: live games patch every 2.5 s —
  // a full re-render would replay every card's entrance animation and drop hover/keyboard focus).
  const showingEmpty = !!roomListEl.querySelector('.room-list__empty');
  const willBeEmpty = currentRooms.length === 0;
  if (showingEmpty || willBeEmpty) {
    renderRoomList(currentRooms);
    renderHero();
    return;
  }

  const nodesByRoomId = new Map();
  for (const node of roomListEl.children) {
    if (node.dataset && node.dataset.roomId) nodesByRoomId.set(node.dataset.roomId, node);
  }

  for (const roomId of removed) {
    const node = nodesByRoomId.get(roomId);
    if (node) node.remove();
  }

  for (const room of upserts) {
    const existing = nodesByRoomId.get(room.roomId);
    if (existing) {
      updateRoomRowNode(existing, room);
    } else {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = buildRoomRowHtml(room, { animate: true });
      roomListEl.appendChild(wrapper.firstElementChild);
    }
  }

  renderHero();
}

// The meta line under the players: room name as plain text, everything else a tag chip (.rtag).
// Every dynamic piece goes through escapeHtml, so a room/host name can never inject markup.
function buildRoomMeta(room) {
  const tag = (text, mod = '', title = '') => `<span class="rtag${mod ? ' rtag--' + mod : ''}"${title ? ` title="${escapeHtml(title)}"` : ''}>${escapeHtml(text)}</span>`;
  const time = buildTimeSummary(room);
  return [
    `<span class="room-row__host">${escapeHtml(room.roomName || room.roomId)}</span>`,
    ...buildRuleTags(room).map((x, i) => tag(x, '', i === 0 && isCustomRules(room) ? buildRuleTitle(room) : '')),
    time ? tag(time) : '',
    room.ranked === false ? tag(t('room.mode_friendly'), 'friendly') : tag(t('room.mode_rated'), 'rated'),
  ].join('');
}

// A seat to sit in = "Vào"; a running game or a full table = "Quan sát" (same predicate as the Quan sát tab).
function canWatch(room) {
  return room.state === 'playing' || room.playerCount >= 2;
}

// "5+3" (blitz: minutes + increment), "10'" (per game), "60s/nước" (per move); '' when the payload has no clock.
function buildTimeSummary(room) {
  const s = room.timerSeconds;
  if (typeof s !== 'number') return '';
  if (room.timerMode === 'blitz') return `${Math.round(s / 60)}+${room.timerIncrementSeconds || 0}`;
  if (room.timerMode === 'per_game') return `${Math.round(s / 60)}'`;
  return t('lobby.time_per_move', { s });
}

// One plain-language tag instead of the jargon cluster (Wall / Portal / Swap2 /
// Caro); the full breakdown is in the tooltip (buildRuleTitle) (#253).
function isCustomRules(room) {
  return !!(room.ruleWall || room.rulePortal || room.ruleSwap2)
    || (room.winningRule || 'freestyle') !== 'freestyle';
}

function buildRuleTags(room) {
  const size = `${room.boardSize}×${room.boardSize}`;
  return [isCustomRules(room) ? t('lobby.rules_custom') : t('lobby.rules_standard'), size];
}

// Full rule list for the tooltip of the compact tag.
function buildRuleTitle(room) {
  const parts = [];
  if (room.ruleWall)   parts.push(t('modal.rule_wall'));
  if (room.rulePortal) parts.push(t('modal.rule_portal'));
  if (room.ruleSwap2)  parts.push('Swap2');
  const win = room.winningRule || 'freestyle';
  if (win === 'standard')  parts.push(t('rule.standard'));
  if (win === 'caro')      parts.push(t('rule.caro'));
  if (win === 'freestyle') parts.push(t('rule.freestyle'));
  return parts.join(' · ');
}

window.addEventListener('langchange', () => {
  renderRoomList(currentRooms);
  renderHero();
  renderOnlineLine();
});

// ---------------------------------------------------------------------------
// Join Room
// ---------------------------------------------------------------------------
// Exposed globally for onclick
window.joinRoom = function(roomId) {
  // Store intent and navigate — room.js will handle the actual join
  sessionStorage.setItem('gvn_room_intent', JSON.stringify({ action: 'join', roomId }));
  window.location.href = roomHref(roomId);
};

// ---------------------------------------------------------------------------
// Create Room Modal
// ---------------------------------------------------------------------------

function openModal() {
  // One-click, low-decision path — always start from the fixed preset rather
  // than recalling last-used settings. The user can still open Advanced and
  // tweak before hitting Quick Match/Confirm.
  // Guests can only play friendly, so preselect it (re-evaluated on every open).
  applySettingsToForm({ ...LITE_DEFAULT_SETTINGS, ranked: !userInfo.isGuest });
  applyModalMode();
  modalOverlay.classList.add('visible');
}

function closeModal() {
  modalOverlay.classList.remove('visible');
}

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

// ── Create-room settings: read / defaults / last-used ───────────────────────

const LAST_SETTINGS_KEY = 'gvn_room_last_settings';

// The form's own hardcoded defaults, used when nothing has been remembered yet.
const DEFAULT_ROOM_SETTINGS = {
  boardSize: 17, winningRule: 'freestyle', ranked: true,
  ruleWall: false, rulePortal: false, ruleSwap2: false,
  timerMode: 'per_move', timerSeconds: 60, timerIncrementSeconds: 0,
};

// Lite mode's fixed preset — Board 17x17 + WALL — applied on every modal
// open in Lite, regardless of any previously recalled settings.
const LITE_DEFAULT_SETTINGS = { ...DEFAULT_ROOM_SETTINGS, ruleWall: true };

function readFormSettings() {
  const boardSize = parseInt(
    document.querySelector('input[name="boardSize"]:checked').value, 10
  );
  const timerMode = document.querySelector('input[name="timerMode"]:checked').value;
  const timerSeconds = parseInt(document.getElementById('timer-seconds').value, 10) || 60;
  // Increment only takes effect in blitz mode (TimerManager.applyMove) — zero
  // it out otherwise so the stored/submitted setting doesn't imply it's active.
  const timerIncrementSeconds = timerMode === 'blitz'
    ? (parseInt(document.getElementById('timer-increment').value, 10) || 0)
    : 0;
  const winningRule = (document.querySelector('input[name="winRule"]:checked') || {}).value || 'freestyle';
  const ruleSwap2   = (document.querySelector('input[name="openRule"]:checked') || {}).value === 'swap2';
  let   ruleWall    = document.getElementById('rule-wall').checked;
  let   rulePortal  = document.getElementById('rule-portal').checked;
  if (ruleSwap2) { ruleWall = false; rulePortal = false; } // Swap2 plays on a plain board
  const ranked = (document.querySelector('input[name="roomMode"]:checked') || {}).value !== 'friendly';
  return { boardSize, winningRule, ranked, ruleWall, rulePortal, ruleSwap2, timerMode, timerSeconds, timerIncrementSeconds };
}

function saveLastSettings(settings) {
  try {
    localStorage.setItem(LAST_SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) { /* private mode — remembering is best-effort */ }
}

// Push a settings object back into the form controls.
function applySettingsToForm(s) {
  const check = (sel) => { const el = document.querySelector(sel); if (el) el.checked = true; };
  check(`input[name="boardSize"][value="${s.boardSize}"]`);
  check(`input[name="winRule"][value="${s.winningRule}"]`);
  check(`input[name="roomMode"][value="${s.ranked === false ? 'friendly' : 'rated'}"]`);
  check(`input[name="openRule"][value="${s.ruleSwap2 ? 'swap2' : 'none'}"]`);
  check(`input[name="timerMode"][value="${s.timerMode}"]`);
  const wall = document.getElementById('rule-wall');
  const portal = document.getElementById('rule-portal');
  if (wall) wall.checked = !!s.ruleWall;
  if (portal) portal.checked = !!s.rulePortal;
  document.getElementById('timer-seconds').value = s.timerSeconds;
  document.getElementById('timer-increment').value = s.timerIncrementSeconds;
  // Re-run the Swap2 ⇄ board-setup interlock and the Blitz ⇄ increment interlock
  document.querySelectorAll('input[name="openRule"]').forEach(r => r.dispatchEvent(new Event('change')));
  document.querySelectorAll('input[name="timerMode"]').forEach(r => r.dispatchEvent(new Event('change')));
}

function submitCreate(settings) {
  const roomName = document.getElementById('room-name').value.trim();
  saveLastSettings(settings);

  // Store intent and navigate — room.js will handle the actual create
  sessionStorage.setItem('gvn_room_intent', JSON.stringify({
    action: 'create',
    settings: { roomName, ...settings },
  }));

  closeModal();
  window.location.href = roomHref(null); // Create room ID is assigned by server later
}

// Confirm → create room
modalConfirm.addEventListener('click', () => submitCreate(readFormSettings()));

// Lite: "Quick match" — the form, which is already pre-filled with last-used
// settings (or defaults) on open, plus whatever the user tweaked in Advanced.
btnQuickMatch.addEventListener('click', () => {
  submitCreate(readFormSettings());
});

// ── Modal mode gating ───────────────────────────────────────────────────────

// Quick match primary, everything else behind a closed "Advanced".
function applyModalMode() {
  const advanced = document.getElementById('modal-advanced');
  const toggle   = document.getElementById('modal-advanced-toggle');
  if (!advanced || !toggle) return;

  modalOverlay.classList.add('modal--lite');
  advanced.classList.remove('open');
  toggle.setAttribute('aria-expanded', 'false');
}

modalAdvancedToggle.addEventListener('click', () => {
  const advanced = document.getElementById('modal-advanced');
  const open = advanced.classList.toggle('open');
  modalAdvancedToggle.setAttribute('aria-expanded', String(open));
});

applyModalMode();

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

// Timer increment ("Cộng thêm") only takes effect in Blitz mode server-side
// (TimerManager.applyMove) — disable & gray it out for the other modes so it
// doesn't look active when it silently has no effect.
(function () {
  const sync = () => {
    const blitz = document.getElementById('tm-blitz');
    const active = !!(blitz && blitz.checked);
    const el = document.getElementById('timer-increment');
    if (!el) return;
    if (!active) el.value = 0;
    el.disabled = !active;
    const row = document.getElementById('timer-increment-row');
    if (row) row.style.opacity = active ? '' : '0.45';
  };
  document.querySelectorAll('input[name="timerMode"]').forEach(r => r.addEventListener('change', sync));
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

// Escaping lives in escape-utils.js (a pure, Node-testable module imported by
// index-entry.js before this file). These are thin aliases so the call sites
// below read the same as before.
const escapeAttr = (str) => globalThis.EscapeUtils.escapeAttr(str);
