'use strict';

/**
 * state.js — Shared Socket state & helpers.
 *
 * All mutable state that must be shared across domain handlers is held here.
 * Handlers import individual pieces; nothing is exported as a single bundle
 * to keep coupling explicit.
 */

const logger      = require('../utils/logger');
const roomManager = require('../managers/RoomManager');
const TimerManager = require('../managers/TimerManager');
const { resolveClientIp } = require('../utils/get-client-ip');

// ---------------------------------------------------------------------------
// Shared state maps
// ---------------------------------------------------------------------------

/** Per-room timer storage: roomId → TimerManager instance */
const timerMap = new Map();

/** Per-player disconnect grace timers: userId → { timeout, countdown, roomId } */
const disconnectTimers = new Map();

/** Per-user empty-room grace timers: userId → { timeout, roomId } */
const emptyRoomGraceTimers = new Map();

/**
 * Per-user spectator/non-ongoing-player grace timers: userId → { timeout, roomId }.
 * Separate map from emptyRoomGraceTimers even though the shape is identical —
 * they cover disjoint cases (sole occupant vs. others still present) and are
 * started/cancelled independently; merging them would make a user who is
 * simultaneously "the last one" and "not in an ongoing game" ambiguous to
 * reason about. See TODO.md #39 / instruction.md §39.
 */
const spectatorGraceTimers = new Map();

/** Per-room ready-window timers (Start modal 15s countdown): roomId → Timeout */
const readyTimers = new Map();

/**
 * How long the *other* seated player has to click Start once one of the two
 * has already clicked it. Unlike the old model, both seats filled does NOT
 * start this countdown by itself — see handleReadyClick() below.
 */
const READY_WINDOW_MS = 15_000;

/**
 * Session registry: userId → live Socket.
 *
 * A "session" is exactly one authenticated Socket.io connection for a given
 * userId. The socket stored here for a userId IS that user's one active
 * session, by definition — this map is the single source of truth, not a
 * cache of ids that still needs a lookup elsewhere. Single-device-per-token
 * enforcement means a userId has at most one live socket, so no count is
 * needed and eviction is a plain Map.get/set (O(1), no scan of
 * io.sockets.sockets required).
 */
const sessions = new Map();

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Members who chose "hide online status" (#199). They stay connected and keep
 * working normally, but are left out of the lobby online list that is fanned
 * out to everyone. Kept in memory: set at connect from the DB, updated live by
 * PUT /api/profile.
 */
const hiddenOnline = new Set();
let _lastIo = null;

/** @param {string} userId @param {boolean} hidden — re-broadcasts the list when the user is connected. */
function setHideOnline(userId, hidden) {
  const had = hiddenOnline.has(userId);
  if (hidden) hiddenOnline.add(userId); else hiddenOnline.delete(userId);
  // A heartbeat-only user (settings.html has no socket) is listed too — re-broadcast for them as well.
  if (had !== !!hidden && (sessions.has(userId) || _freshBeat(userId)) && _lastIo) broadcastOnlineUsers(_lastIo);
}

/**
 * Site-wide presence (#372). ONE rule for every page: a user is "online" only while they are present
 * on the site — connected AND the tab visible+focused. A tab in the background / another window in
 * front = 'away' (treated like offline for online lists, counts, DM push, challenge picker).
 * Reported by the client on any page (`presence:set`, `room:presence`); absent entry = 'active'
 * (a fresh socket is presumed present until its page says otherwise). Cleared with the session.
 */
const awayUsers = new Set();

/** @param {string} userId @param {'active'|'away'} presence @returns {boolean} true if it changed */
function setUserPresence(userId, presence) {
  const had = awayUsers.has(userId);
  if (presence === 'away') awayUsers.add(userId); else awayUsers.delete(userId);
  const changed = had !== (presence === 'away');
  if (changed && sessions.has(userId) && _lastIo) broadcastOnlineUsers(_lastIo);
  return changed;
}

/**
 * HTTP heartbeats (#372) for pages WITHOUT a socket (social, profile, forum, clubs, puzzles…): the shell
 * posts {presence} every ~20s. A beat counts for BEAT_TTL_MS; no beat (tab closed / hidden pauses the
 * timer) = gone. userId → { at, away, user: { userId, displayName, isGuest } }.
 */
const BEAT_TTL_MS = 45_000;
const heartbeats = new Map();

function _freshBeat(userId, now = Date.now()) {
  const b = heartbeats.get(userId);
  return b && now - b.at <= BEAT_TTL_MS ? b : null;
}

/** Record a heartbeat. Returns true if the user's visible-online state may have changed (list re-broadcast). */
function touchHeartbeat(user, presence, now = Date.now()) {
  const prev = _freshBeat(user.userId, now);
  const away = presence === 'away';
  heartbeats.set(user.userId, { at: now, away, user: { userId: user.userId, displayName: user.displayName, isGuest: !!user.isGuest } });
  const changed = !prev || prev.away !== away;
  if (changed && _lastIo) broadcastOnlineUsers(_lastIo);
  return changed;
}

/** Drop expired beats; re-broadcast if any present user vanished. */
function pruneHeartbeats(now = Date.now()) {
  let gone = false;
  for (const [id, b] of heartbeats) {
    if (now - b.at > BEAT_TTL_MS) { heartbeats.delete(id); if (!b.away) gone = true; }
  }
  if (gone && _lastIo) broadcastOnlineUsers(_lastIo);
  return gone;
}
setInterval(() => pruneHeartbeats(), 15_000).unref();

/** Forget a user's heartbeat now (logout, account lock/delete) instead of waiting out BEAT_TTL_MS. */
function dropHeartbeat(userId) {
  const b = heartbeats.get(userId);
  if (!b) return false;
  heartbeats.delete(userId);
  if (_lastIo) broadcastOnlineUsers(_lastIo);
  return true;
}

/**
 * A live socket whose page is visible+focused — the only place a live push (DM, bell) can land.
 * Narrower than isPresent: a heartbeat-only page (forum, profile…) has no socket to receive it,
 * so a DM to that user must still create the bell entry.
 */
function hasPresentSocket(userId) {
  return sessions.has(userId) && !awayUsers.has(userId);
}

/** Present = a socket that is visible+focused, OR a fresh non-away heartbeat. Hidden-online is a separate privacy filter. */
function isPresent(userId) {
  if (sessions.has(userId) && !awayUsers.has(userId)) return true;
  const b = _freshBeat(userId);
  return !!(b && !b.away);
}

/** Connected, present and not hiding it (#199) — what other members may be told (#222 friend picker). */
function isVisiblyOnline(userId) {
  return isPresent(userId) && !hiddenOnline.has(userId);
}

/**
 * Return the online users for lobby broadcast, sorted by display name.
 *
 * Shape: `[{ userId, displayName, isGuest, avatarUrl }]`. This used to be a bare
 * `string[]` of display names; Private Chat (#159) needs the userId to route a
 * `private_message:send` and the guest flag to badge the row, and the
 * online-users channel is the natural carrier since it already fans the full
 * list to every lobby socket. `sessions` is `Map<userId, socket>` so
 * `s.user` already holds all three fields.
 */
function getOnlineUsersList() {
  const byId = new Map();
  for (const s of sessions.values()) if (!awayUsers.has(s.user.userId)) byId.set(s.user.userId, s.user);
  const now = Date.now();
  for (const [id, b] of heartbeats) if (!byId.has(id) && !b.away && now - b.at <= BEAT_TTL_MS) byId.set(id, b.user);
  return Array.from(byId.values())
    .filter(u => !hiddenOnline.has(u.userId))
    .map(u => ({
      userId: u.userId,
      displayName: u.displayName,
      isGuest: !!u.isGuest,
      // Same lookup the room payload uses (null for guests / no avatar) — the lobby faces
      // drew initials for everyone while this was missing.
      avatarUrl: u.isGuest || !roomManager.avatarLookup ? null : roomManager.avatarLookup(u.userId),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Resolve the real client IP for a socket, accounting for a same-host proxy
 * (e.g. cloudflared) connecting in over loopback. engine.io always reports
 * `socket.handshake.address` from the raw TCP connection — it never reads
 * X-Forwarded-For itself, unlike Express's `trust proxy` setting (see
 * server/index.js), which only affects Express's own req.ip.
 *
 * The actual CF-Connecting-IP / X-Forwarded-For / loopback logic lives in
 * ../utils/get-client-ip.js's resolveClientIp() — shared with the
 * express-rate-limit instances in server/routes/*.js, which need the exact
 * same resolution for a plain Express `req` (see getClientIpFromReq there).
 *
 * @param {import('socket.io').Socket} socket
 * @returns {string|undefined}
 */
function getClientIp(socket) {
  const headers = socket.handshake && socket.handshake.headers;
  const remote = socket.handshake && socket.handshake.address;
  return resolveClientIp(headers, remote);
}

/**
 * How long to coalesce bursts of room mutations (sit/ready/start/resign/...)
 * into a single lobby broadcast. broadcastLobbyUpdate() is called from ~15
 * sites across the room lifecycle, and several of them fire back-to-back for
 * one user action.
 *
 * This window used to be the whole defence, and the verification pass showed
 * it failing at real player pace: actions ~1200ms apart each landed in their
 * own window, so a seat+ready+start+resign cycle still pushed 4 full-list
 * payloads. Now that each broadcast carries only what changed, the window size
 * stops being load-bearing — it just merges same-instant bursts.
 */
const LOBBY_UPDATE_DEBOUNCE_MS = 300;

/** Per-io pending debounce timer for broadcastLobbyUpdate(). */
const _lobbyUpdateTimers = new WeakMap();

/**
 * Debounce window for broadcastOnlineUsers(), mirroring
 * LOBBY_UPDATE_DEBOUNCE_MS above. Connect/disconnect churn (many sessions
 * flipping in a short window — reconnect storms, or the synchronized
 * connection bursts measured in docs/stress-test-report.md §10) used to
 * rebuild and broadcast the full online-users list once per individual
 * connect/disconnect, an O(n) rebuild-and-fan-out fired up to n times, i.e.
 * O(n²) total during a burst of n near-simultaneous connections. Debouncing
 * collapses any such burst into one rebuild+broadcast per window.
 *
 * 300ms was tuned for that synchronized-burst case, but review 12.5
 * (TODO.md #41) measured real reconnect traffic — sockets rejoining
 * 150-400ms apart, spread out by client/js/socket-client.js's
 * reconnectionDelay (1000ms base + jitter) applied independently per
 * socket — landing mostly in separate 300ms windows: 39 reconnects only
 * collapsed to 28 broadcasts (~28% reduction) instead of the ~97% seen in
 * the synchronized-burst case. Widening the window to 1.5s (still well
 * under the >1s gap between a single socket's own reconnect attempts, so
 * it can't merge two real distinct reconnects from the same socket)
 * catches that spread-out traffic too, without a payload-format change.
 */
const ONLINE_USERS_DEBOUNCE_MS = 1_500;

/** Per-io pending debounce timer for broadcastOnlineUsers(). */
const _onlineUsersTimers = new WeakMap();

/**
 * Per-io record of what lobby clients were last told: roomId → serialized
 * entry. Diffing against this at flush time is what makes the delta possible
 * without touching the ~15 call sites: they say "something changed", and the
 * flush works out what, by comparing against real state. A call site cannot
 * describe the change wrongly or forget to, because it never describes it.
 */
const _lobbySnapshots = new WeakMap();

/**
 * Compare the live room list against what lobby clients were last sent.
 * @returns {{ upserts: object[], removed: string[] }}
 */
function _diffLobbyRooms(io) {
  const previous = _lobbySnapshots.get(io) || new Map();
  const next = new Map();
  const upserts = [];

  for (const entry of roomManager.listRooms()) {
    const serialized = JSON.stringify(entry);
    next.set(entry.roomId, serialized);
    if (previous.get(entry.roomId) !== serialized) upserts.push(entry);
  }

  const removed = [];
  for (const roomId of previous.keys()) {
    if (!next.has(roomId)) removed.push(roomId);
  }

  _lobbySnapshots.set(io, next);
  return { upserts, removed };
}

/**
 * Send the full room list to one socket, and seed the delta baseline.
 *
 * A client joining mid-stream must receive a complete snapshot once before any
 * patch can mean anything — see LobbyHandler's `lobby:subscribe`.
 */
function sendLobbySnapshot(io, socket) {
  const rooms = roomManager.listRooms();
  socket.emit('lobby:update', { rooms, serverTime: Date.now() }); // serverTime: clock offset for the cards' elapsed time (#364, as B170)
  if (!_lobbySnapshots.has(io)) {
    const baseline = new Map();
    for (const entry of rooms) baseline.set(entry.roomId, JSON.stringify(entry));
    _lobbySnapshots.set(io, baseline);
  }
}

/**
 * Broadcast what changed in the room list to everyone in the lobby (debounced).
 *
 * Sends `lobby:patch` — `{ upserts, removed }` — instead of the whole list.
 * Both operations are idempotent by design: re-sending an entry a client
 * already has is a no-op, and removing a roomId it never had is a no-op. That
 * matters because a socket that subscribes between two flushes gets a snapshot
 * which may already include a change the next patch also carries.
 *
 * Emits nothing at all when nothing actually changed — the old code sent a
 * full list every time regardless.
 */
function broadcastLobbyUpdate(io) {
  require('./home-feed').scheduleHomeUpdate(io); // B225: playing count + live list (lazy: home-feed requires this module)
  _scheduleLobbyFlush(io);
}

/** The debounced diff + `lobby:patch` emit shared by broadcastLobbyUpdate and the board throttle. */
function _scheduleLobbyFlush(io) {
  if (_lobbyUpdateTimers.has(io)) return; // a broadcast is already scheduled for this burst
  const timeout = setTimeout(() => {
    _lobbyUpdateTimers.delete(io);
    const { upserts, removed } = _diffLobbyRooms(io);
    if (upserts.length === 0 && removed.length === 0) return;
    io.to('lobby').emit('lobby:patch', { upserts, removed, serverTime: Date.now() });
  }, LOBBY_UPDATE_DEBOUNCE_MS);
  _lobbyUpdateTimers.set(io, timeout);
}

/**
 * Lobby mini boards (#364): a move changes `moves` in listRooms(), but nothing else would tell the
 * lobby. GameHandler calls this after each move; at most one flush per LOBBY_BOARD_THROTTLE_MS per
 * server carries every game's position at once (diffed, so only rooms that moved are sent). Home
 * feed is not poked — its counts don't change on a move.
 */
const LOBBY_BOARD_THROTTLE_MS = 2_500;
const _lobbyBoardTimers = new WeakMap();
function scheduleLobbyBoardUpdate(io) {
  if (_lobbyBoardTimers.has(io)) return;
  const timeout = setTimeout(() => {
    _lobbyBoardTimers.delete(io);
    _scheduleLobbyFlush(io);
  }, LOBBY_BOARD_THROTTLE_MS);
  if (timeout.unref) timeout.unref();
  _lobbyBoardTimers.set(io, timeout);
}

/**
 * Per-io record of what lobby clients were last told about online users:
 * userId → serialized entry. Same technique as `_lobbySnapshots` (#230).
 */
const _onlineSnapshots = new WeakMap();

/**
 * Per-io userIds handed out in a `sendOnlineSnapshot()` since the last flush.
 * A user who joins and leaves inside one debounce window is never in the
 * baseline, but a socket that subscribed in between holds them — so they are
 * removal candidates too (the #187 trap, for the online list).
 */
const _onlineSnapshotSeen = new WeakMap();

/**
 * Compare the live online list against what lobby clients were last sent.
 * @returns {{ joined: object[], left: string[] }}
 */
function _diffOnlineUsers(io) {
  const previous = _onlineSnapshots.get(io) || new Map();
  const next = new Map();
  const joined = [];

  for (const entry of getOnlineUsersList()) {
    const serialized = JSON.stringify(entry);
    next.set(entry.userId, serialized);
    if (previous.get(entry.userId) !== serialized) joined.push(entry);
  }

  const candidates = new Set(previous.keys());
  for (const userId of _onlineSnapshotSeen.get(io) || []) candidates.add(userId);
  const left = [];
  for (const userId of candidates) {
    if (!next.has(userId)) left.push(userId);
  }

  _onlineSnapshots.set(io, next);
  _onlineSnapshotSeen.delete(io);
  return { joined, left };
}

/**
 * Send the full online list to one socket (on `lobby:subscribe`), and seed the
 * delta baseline. Every later `lobby:online_patch` is a delta against it.
 */
function sendOnlineSnapshot(io, socket) {
  const users = getOnlineUsersList();
  socket.emit('lobby:online_users', users);
  if (!_onlineSnapshots.has(io)) {
    const baseline = new Map();
    for (const entry of users) baseline.set(entry.userId, JSON.stringify(entry));
    _onlineSnapshots.set(io, baseline);
  }
  if (!_onlineSnapshotSeen.has(io)) _onlineSnapshotSeen.set(io, new Set());
  const seen = _onlineSnapshotSeen.get(io);
  for (const entry of users) seen.add(entry.userId);
}

/**
 * Broadcast what changed in the online list to the lobby (debounced).
 *
 * Sends `lobby:online_patch` — `{ joined, left }` — instead of the whole list
 * (#230: the full list per flush was O(n²) bytes). `joined` also carries
 * entries whose fields changed. Both are idempotent on the client, and nothing
 * is emitted when nothing changed.
 *
 * See ONLINE_USERS_DEBOUNCE_MS above for why this can't just emit
 * immediately on every call the way it used to.
 *
 * @param {import('socket.io').Server} io
 */
function broadcastOnlineUsers(io) {
  _lastIo = io;
  require('./home-feed').scheduleHomeUpdate(io); // B225: online count
  if (_onlineUsersTimers.has(io)) return; // a broadcast is already scheduled for this burst
  const timeout = setTimeout(() => {
    _onlineUsersTimers.delete(io);
    const { joined, left } = _diffOnlineUsers(io);
    if (joined.length === 0 && left.length === 0) return;
    io.to('lobby').emit('lobby:online_patch', { joined, left });
  }, ONLINE_USERS_DEBOUNCE_MS);
  _onlineUsersTimers.set(io, timeout);
}

/**
 * Per-room record of what `room:updated` clients were last told about that
 * room's user list: roomId → Map(userId → serialized-user JSON string).
 * Diffing against this at broadcast time is what makes a per-user delta
 * possible without touching the ~17 call sites that trigger a `room:updated`
 * (sit/stand/ready/join/leave/kick/game-end/...): they say "something in this
 * room changed", and the diff works out which users' entries actually did, by
 * comparing against real state — the same technique `_diffLobbyRooms` above
 * already uses for the lobby room list.
 *
 * Keyed by roomId (a plain Map, not a WeakMap) because a roomId is a string,
 * not an object to hold a weak reference to — entries are dropped explicitly
 * via clearRoomUpdateSnapshot() when the room is destroyed instead.
 */
const _roomUserSnapshots = new Map();

/** Per-room last-broadcast `scoreTable` JSON string, for change detection. */
const _roomScoreTableSnapshots = new Map();
/** Per-room last-broadcast `gameLog` JSON string (#368), same change detection as scoreTable. */
const _roomGameLogSnapshots = new Map();

/**
 * Diff a room's current user list against what was last broadcast for it.
 * A user's role (host/player/guest) is computed fresh into each serialized
 * entry by RoomManager, so e.g. a host handover naturally shows up as both
 * the old and new host's entries changing — no separate handling needed.
 *
 * @returns {{ upserts: object[], removed: string[] }}
 */
function _diffRoomUsers(roomId, users, seenUserIds) {
  const previous = _roomUserSnapshots.get(roomId) || new Map();
  const next = new Map();
  const upserts = [];

  for (const user of users) {
    const serialized = JSON.stringify(user);
    next.set(user.userId, serialized);
    if (previous.get(user.userId) !== serialized) upserts.push(user);
  }

  // Removal candidates are everyone the last broadcast carried PLUS everyone
  // present at a broadcastRoomUpdate() call in this debounce window. The
  // second set matters because a joiner's list comes from `room:joined` (full
  // state), not from a delta: someone who leaves inside the same window as
  // that join was never in `previous`, so without it their removal was never
  // sent and the joiner kept a stale entry (TODO.md #187, two host badges).
  // Removing an id a client never held is a no-op on the client.
  const removed = [];
  const candidates = new Set(previous.keys());
  for (const userId of seenUserIds || []) candidates.add(userId);
  for (const userId of candidates) {
    if (!next.has(userId)) removed.push(userId);
  }

  _roomUserSnapshots.set(roomId, next);
  return { upserts, removed };
}

/**
 * Compute and emit one room's delta payload right now. Split out from
 * broadcastRoomUpdate() so the debounced flush below can call it with a
 * freshly-looked-up room, without re-triggering the debounce itself.
 *
 * `RoomManager.serializeRoomUpdate()` still builds the full current state —
 * that part hasn't changed — but the `users` array (the O(n) piece that made
 * the old full-broadcast-to-full-room shape scale as O(n²) with room size,
 * per `issue report.md` §4.2) is now diffed into `{ upserts, removed }`
 * instead of always going out whole, and only included at all when something
 * in it actually changed. `scoreTable` (the other array-shaped, room-size-
 * scaling field) gets the same treatment. The remaining scalar fields
 * (roomName, hostId, hostName, state, readyDeadline, serverTime, readyMissCount) are cheap
 * regardless of room size, so they're just always included — diffing them individually
 * would add complexity without addressing the O(n²) this exists to remove.
 *
 * @param {import('socket.io').Server} io
 * @param {object} room
 * @param {{ settings?: boolean }} [opts]
 */
function _emitRoomUpdate(io, room, opts = {}) {
  const full = roomManager.serializeRoomUpdate(room);
  const { upserts, removed } = _diffRoomUsers(room.roomId, full.users, opts.seenUserIds);

  const scoreTableJson = JSON.stringify([full.scoreTable, full.scoreHistory]);
  const scoreTableChanged = _roomScoreTableSnapshots.get(room.roomId) !== scoreTableJson;
  if (scoreTableChanged) _roomScoreTableSnapshots.set(room.roomId, scoreTableJson);
  const gameLogJson = JSON.stringify(full.gameLog);
  const gameLogChanged = _roomGameLogSnapshots.get(room.roomId) !== gameLogJson;
  if (gameLogChanged) _roomGameLogSnapshots.set(room.roomId, gameLogJson);

  const payload = {
    roomName: full.roomName,
    hostId: full.hostId,
    hostName: full.hostName,
    state: full.state,
    readyDeadline: full.readyDeadline,
    // Fresh server-clock stamp at emit time — the client anchors its ready-phase
    // countdown to this (see docs/todo/B170-*.md). Stamped here rather than read
    // from `full` so it reflects when the packet actually leaves, and `_emitRoomUpdate`
    // builds its payload field-by-field rather than spreading `full`.
    serverTime: Date.now(),
    readyMissCount: full.readyMissCount,
    matchGames: full.matchGames,
    matchMax: full.matchMax,
  };
  if (upserts.length > 0 || removed.length > 0) payload.users = { upserts, removed };
  if (scoreTableChanged) { payload.scoreTable = full.scoreTable; payload.scoreHistory = full.scoreHistory; }
  if (gameLogChanged) payload.gameLog = full.gameLog;
  if (opts.settings) payload.settings = { ...room.settings };

  io.to(room.roomId).emit('room:updated', payload);
}

/**
 * How long to coalesce bursts of `broadcastRoomUpdate()` calls for the SAME
 * room into a single `room:updated` emit. Added per TODO.md #22's stress-test
 * finding: a burst of spectators joining one room within a short window (each
 * `room:join` independently calling broadcastRoomUpdate) re-broadcasts full
 * per-user state to the WHOLE room on every single join, so join-phase cost
 * scaled quadratically with room size (~1+2+...+19 sends for 19 near-
 * simultaneous joins) even though steady-state (one move at a time in an
 * already-full room) measured fine.
 *
 * 80ms is far below human reaction time — nobody perceives a room:updated
 * landing 80ms later than the action that caused it — but wide enough to
 * merge a realistic join burst (or a sit+ready+kick sequence a caller fires
 * back-to-back) into one flush, same rationale as LOBBY_UPDATE_DEBOUNCE_MS
 * above, just scoped per-room instead of server-wide.
 */
const ROOM_UPDATE_DEBOUNCE_MS = 80;

/** Per-room pending debounce timer for broadcastRoomUpdate(): roomId → Timeout. */
const _roomUpdateTimers = new Map();

/**
 * Per-room state accumulated across calls within one debounce window:
 * roomId → { io, settings }. `room` itself isn't stored here — RoomManager
 * mutates rooms in place (never replaces the Map entry except on create), so
 * a fresh `roomManager.getRoom(roomId)` at flush time is already current;
 * storing a captured `room` reference would work too but this avoids relying
 * on that mutate-in-place invariant holding across handler changes.
 */
const _roomUpdatePending = new Map();

function _flushRoomUpdate(roomId) {
  _roomUpdateTimers.delete(roomId);
  const pending = _roomUpdatePending.get(roomId);
  _roomUpdatePending.delete(roomId);
  if (!pending) return;

  const room = roomManager.getRoom(roomId);
  if (!room) return; // destroyed before this burst's debounce window elapsed

  _emitRoomUpdate(pending.io, room, { settings: pending.settings, seenUserIds: pending.seenUserIds });
}

/**
 * Broadcast a room's current state to everyone in it, as a delta (debounced).
 *
 * See ROOM_UPDATE_DEBOUNCE_MS above and TODO.md #22 for why this is debounced
 * per-room rather than firing synchronously like it used to.
 *
 * @param {import('socket.io').Server} io
 * @param {object} room
 * @param {{ settings?: boolean }} [opts] — pass `settings: true` for the one
 *   call site (RoomHandler.js's `room:settings` handler) where settings did
 *   actually just change and clients need the new values. If ANY call within
 *   a debounce window passed `settings: true`, the flushed payload includes
 *   settings — the flag doesn't get lost if a later call in the same burst
 *   omits it.
 */
function broadcastRoomUpdate(io, room, opts = {}) {
  const roomId = room.roomId;
  const existing = _roomUpdatePending.get(roomId);
  // Everyone in the room at any call this window — see _diffRoomUsers (#187).
  const seenUserIds = existing ? existing.seenUserIds : new Set();
  if (room.users) for (const userId of room.users.keys()) seenUserIds.add(userId);
  _roomUpdatePending.set(roomId, {
    io,
    settings: !!(opts.settings || (existing && existing.settings)),
    seenUserIds,
  });

  if (_roomUpdateTimers.has(roomId)) return; // a flush is already scheduled for this burst
  const timeout = setTimeout(() => _flushRoomUpdate(roomId), ROOM_UPDATE_DEBOUNCE_MS);
  _roomUpdateTimers.set(roomId, timeout);
}

/**
 * Drop a destroyed room's `room:updated` diff baseline and cancel any pending
 * debounced flush, so these maps/timers don't grow forever (or fire after
 * teardown) as rooms are created and destroyed over the server's uptime.
 * Called from RoomManager's `room_destroyed` event (SocketHandler.js), which
 * fires from every teardown path (`_destroyRoom` is the single choke point).
 *
 * @param {string} roomId
 */
function clearRoomUpdateSnapshot(roomId) {
  _roomUserSnapshots.delete(roomId);
  _roomScoreTableSnapshots.delete(roomId);
  _roomGameLogSnapshots.delete(roomId);

  const timeout = _roomUpdateTimers.get(roomId);
  if (timeout) {
    clearTimeout(timeout);
    _roomUpdateTimers.delete(roomId);
  }
  _roomUpdatePending.delete(roomId);
}

/**
 * Find all active Socket.io sockets belonging to a given userId.
 * @param {import('socket.io').Server} io
 * @param {string} userId
 * @param {string} [excludeSocketId] — skip this socket.id (e.g. the caller's own new connection)
 */
function findSocketsByUserId(io, userId, excludeSocketId = null) {
  const results = [];
  for (const [, s] of io.sockets.sockets) {
    if (s.id === excludeSocketId) continue;
    if (s.user && s.user.userId === userId) results.push(s);
  }
  return results;
}

/** Stop and destroy the TimerManager for a room, then remove it from the map. */
function cleanupRoomTimer(roomId) {
  const timer = timerMap.get(roomId);
  if (timer) {
    timer.destroy();
    timerMap.delete(roomId);
  }
}

/** Cancel the ready-window countdown (Start modal) for a room, if any. */
function cleanupReadyTimer(roomId) {
  const timeout = readyTimers.get(roomId);
  if (timeout) {
    clearTimeout(timeout);
    readyTimers.delete(roomId);
  }
}

/**
 * Cancel any pending ready-window countdown for a room and clear its
 * deadline, WITHOUT starting a new one. Called after every mutation that can
 * invalidate an in-flight countdown (sit, stand, kick, leave, settings
 * change, game end) — see instruction.md §B36 for why this no longer
 * auto-starts a new window the way the old syncReadyWindow() did: the
 * countdown is now only ever opened by a player explicitly clicking Start
 * (handleReadyClick() below), never merely by both seats being filled.
 *
 * @param {import('socket.io').Server} io
 * @param {object} room
 */
function clearReadyState(io, room) {
  if (!room) return;
  cleanupReadyTimer(room.roomId);
  room.readyDeadline = null;
}

/**
 * One seated player clicked "Start" (`room:ready`) and the room isn't fully
 * ready yet — open the 15s window for the other seat to click too, unless
 * one is already running. No-ops if fewer than 2 seats are filled (the
 * click still records that player as ready; the countdown only makes sense
 * once there's an opponent to wait on).
 *
 * @param {import('socket.io').Server} io
 * @param {object} room
 */
function handleReadyClick(io, room) {
  if (!room) return;
  if (!roomManager.bothSeated(room)) return;
  if (readyTimers.has(room.roomId)) return; // window already counting down

  room.readyDeadline = Date.now() + READY_WINDOW_MS;
  const timeout = setTimeout(() => handleReadyWindowTimeout(io, room.roomId), READY_WINDOW_MS);
  readyTimers.set(room.roomId, timeout);
}

/**
 * Ready-window deadline reached without the other seated player clicking
 * Start — this is one "miss" for the current seat pair (see
 * RoomManager.registerReadyMiss for the 3-miss counting/kick rule). Below 3
 * misses, both seats simply go back to waiting (no kick, no auto-restart).
 * At the 3rd miss, the seat that still hasn't clicked is vacated; the seat
 * that did click keeps their spot.
 *
 * @param {import('socket.io').Server} io
 * @param {string} roomId
 */
function handleReadyWindowTimeout(io, roomId) {
  readyTimers.delete(roomId);

  const room = roomManager.getRoom(roomId);
  if (!room || room.state === 'playing') return;
  room.readyDeadline = null;

  const { kicked, missCount } = roomManager.registerReadyMiss(roomId);
  if (!kicked && missCount === 0) return; // defensive: nothing to report (see registerReadyMiss)

  broadcastRoomUpdate(io, room);
  if (kicked) {
    io.to(roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${kicked.displayName} không bấm Bắt đầu kịp thời (lần 3/3) nên bị rời khỏi vị trí.`,
      code: 'READY_MISS_KICKED', vars: { name: kicked.displayName },
      timestamp: Date.now(), isSystem: true,
    });
    broadcastLobbyUpdate(io);
  } else {
    io.to(roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `Chưa đủ 2 người bấm Bắt đầu kịp thời (lần ${missCount}/3). Hãy bấm lại.`,
      code: 'READY_MISS_RETRY', vars: { count: missCount },
      timestamp: Date.now(), isSystem: true,
    });
  }
}

// ── Quick-match sessions (#365) ─────────────────────────────────────────
// A matchmade room plays up to `room.matchMax` games. After each game both
// seats get one decision window (READY_WINDOW_MS) to pick "Chơi tiếp"
// (= room:ready, both → next game) or "Về trang chủ" (= room:leave). The
// window lives in `readyTimers`, so handleReadyClick() won't open a second
// one and the existing allReady → startGame path clears it. Once the cap is
// hit the room closes after MATCH_END_CLOSE_MS (time to see the result).

const MATCH_END_CLOSE_MS = 5_000;

/** Called by handleGameEnd for a matchmade room, after matchGames was bumped. */
function openMatchDecision(io, room) {
  if (!room || !room.matchmade) return;
  cleanupReadyTimer(room.roomId);
  const done = (room.matchGames || 0) >= (room.matchMax || 1);
  const ms = done ? MATCH_END_CLOSE_MS : READY_WINDOW_MS;
  const code = done ? 'MATCH_SESSION_DONE' : 'MATCH_NO_REMATCH';
  room.readyDeadline = Date.now() + ms;
  readyTimers.set(room.roomId, setTimeout(() => {
    readyTimers.delete(room.roomId);
    closeMatchRoom(io, room.roomId, code);
  }, ms));
}

const MATCH_CLOSE_TEXT = {
  MATCH_SESSION_DONE: 'Đã chơi đủ số ván của trận ghép. Về trang chủ.',
  MATCH_NO_REMATCH: 'Không đủ 2 người chọn chơi tiếp. Về trang chủ.',
  MATCH_OPPONENT_LEFT: 'Đối thủ đã rời trận. Về trang chủ.',
};

/**
 * End a quick-match session: everyone in the room gets `room:destroyed`
 * (the client toasts + navigates home), then the room is torn down through
 * the usual `_destroyRoom` choke point. No-op while a game is running.
 */
function closeMatchRoom(io, roomId, code) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.matchmade || room.state === 'playing') return;
  cleanupReadyTimer(roomId);
  cleanupRoomTimer(roomId);
  io.to(roomId).emit('room:destroyed', { message: MATCH_CLOSE_TEXT[code] || '', code });
  if (io.in) io.in(roomId).socketsLeave(roomId);
  roomManager._destroyRoom(roomId);
  logger.info('[Match] session closed', { roomId, code, games: room.matchGames });
}

/**
 * Build the full room-state payload the client rebuilds a room page from.
 *
 * This is the payload `room:joined` carries — room metadata plus, when a game
 * is running, the serialized engine state and the timer's current values and
 * deadline. It lives here rather than inline in SocketHandler because
 * `game:resync` (TODO.md #152) needs to hand out *exactly* the same thing:
 * two independently written state-rebuild paths would drift apart, and the
 * client only has one handler that knows how to consume it.
 *
 * @param {object} room
 * @returns {object} payload suitable for `socket.emit('room:joined', ...)`
 */
function buildRoomStatePayload(room) {
  const payload = roomManager.serializeRoom(room);
  if (room.gameState) {
    payload.gameState = room.gameState.serialize();
    const timer = timerMap.get(room.roomId);
    if (timer) {
      payload.timer = timer.getTimers();
      // Hand over the deadline too, so the local countdown restarts in step
      // with the server instead of freezing.
      payload.timerSync = timer.getSync();
    }
  }
  return payload;
}

module.exports = {
  ONLINE_USERS_DEBOUNCE_MS,
  timerMap,
  disconnectTimers,
  emptyRoomGraceTimers,
  spectatorGraceTimers,
  readyTimers,
  sessions,
  getOnlineUsersList,
  setHideOnline,
  isVisiblyOnline,
  isPresent,
  hasPresentSocket,
  dropHeartbeat,
  setUserPresence,
  awayUsers,
  touchHeartbeat,
  pruneHeartbeats,
  heartbeats,
  BEAT_TTL_MS,
  getClientIp,
  broadcastLobbyUpdate,
  scheduleLobbyBoardUpdate,
  LOBBY_BOARD_THROTTLE_MS,
  broadcastOnlineUsers,
  broadcastRoomUpdate,
  clearRoomUpdateSnapshot,
  sendLobbySnapshot,
  sendOnlineSnapshot,
  findSocketsByUserId,
  cleanupRoomTimer,
  cleanupReadyTimer,
  clearReadyState,
  buildRoomStatePayload,
  handleReadyClick,
  openMatchDecision,
  closeMatchRoom,
  MATCH_END_CLOSE_MS,
  READY_WINDOW_MS,
};
