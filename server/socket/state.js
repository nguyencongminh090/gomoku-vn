'use strict';

/**
 * state.js — Shared Socket state & helpers.
 *
 * All mutable state that must be shared across domain handlers is held here.
 * Handlers import individual pieces; nothing is exported as a single bundle
 * to keep coupling explicit.
 */

const logger      = require('../utils/logger');
const config      = require('../config');
const roomManager = require('../managers/RoomManager');
const TimerManager = require('../managers/TimerManager');
const { resolveClientIp } = require('../utils/get-client-ip');
const rankCache   = require('../managers/rank-cache');
const { WINNING_RULES } = require('../managers/rules');

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
/** The visibly-online users' raw identities (no DB work) — shared by the list and the count. */
function _visibleOnlineUsers() {
  const byId = new Map();
  for (const s of sessions.values()) if (!awayUsers.has(s.user.userId)) byId.set(s.user.userId, s.user);
  const now = Date.now();
  for (const [id, b] of heartbeats) if (!byId.has(id) && !b.away && now - b.at <= BEAT_TTL_MS) byId.set(id, b.user);
  return Array.from(byId.values()).filter(u => !hiddenOnline.has(u.userId));
}

/**
 * How many users getOnlineUsersList() would return, without building it. The home counters only
 * need the number; building the list costs one avatar lookup per online user (perf/play-lag).
 */
function getOnlineUsersCount() {
  return _visibleOnlineUsers().length;
}

/**
 * Wire shape of one online user. Costs one avatar lookup for a member.
 * #439 S2: members also carry `ratings: { rule: [rating, rank|null, provisional] }` for every rule they
 * are rated in (from rank-cache, no DB read), so a rule-tab switch needs no refetch.
 */
function _onlineEntry(u) {
  const entry = {
    userId: u.userId,
    displayName: u.displayName,
    isGuest: !!u.isGuest,
    // Same lookup the room payload uses (null for guests / no avatar) — the lobby faces
    // drew initials for everyone while this was missing.
    avatarUrl: u.isGuest || !roomManager.avatarLookup ? null : roomManager.avatarLookup(u.userId),
  };
  if (!u.isGuest) entry.ratings = rankCache.ratingsOf(u.userId);
  return entry;
}

const _byName = (a, b) => a.displayName.localeCompare(b.displayName);

/**
 * #439 S3 roster order in a rule: ranked members by rank, then members without a rank there by name,
 * then guests by name.
 */
function _rosterCmp(rule) {
  const group = (u) => {
    if (u.isGuest) return [2, 0];
    const s = rankCache.standingOf(u.userId, rule);
    return s && s[1] != null ? [0, s[1]] : [1, 0];
  };
  return (a, b) => {
    const ga = group(a);
    const gb = group(b);
    return ga[0] - gb[0] || ga[1] - gb[1] || _byName(a, b);
  };
}

function getOnlineUsersList() {
  return _visibleOnlineUsers().map(_onlineEntry).sort(_byName);
}

/** Visibly-online identities sorted by name, no avatar lookups (#381: the Home challenge picker only needs ids). */
function getOnlineUsersSorted() {
  return _visibleOnlineUsers().sort(_byName);
}

/**
 * #381: how many online users a lobby client is sent up front (snapshot + patches). Everyone beyond
 * the first page by name is reachable through `queryOnlineUsers()` only — the full list per
 * subscriber was O(online) bytes each (1.1 MB at 10 000 online).
 */
const ONLINE_PAGE_SIZE = config.ONLINE_PAGE_SIZE;

/** The `limit` raw users that sort first by `cmp` (default: name), without sorting the whole list. */
function _firstByName(users, limit, cmp = _byName) {
  if (users.length <= limit) return users.slice().sort(cmp);
  const top = users.slice(0, limit).sort(cmp);
  for (let i = limit; i < users.length; i++) {
    const u = users[i];
    if (cmp(u, top[limit - 1]) >= 0) continue;
    let lo = 0, hi = limit - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cmp(u, top[mid]) < 0) hi = mid; else lo = mid + 1; }
    top.splice(lo, 0, u);
    top.pop();
  }
  return top;
}

/** First page of the online list + the full count. Avatar lookups only for the page. */
function getOnlineUsersPage() {
  const visible = _visibleOnlineUsers();
  return { total: visible.length, users: _firstByName(visible, ONLINE_PAGE_SIZE).map(_onlineEntry) };
}

/**
 * #381 on-demand lookup for what the first page does not carry.
 * `ids`: which of these users are visibly online (DM window status). Otherwise a name search:
 * `{ q, offset }` → one page of matches by name; with a known `rule` (#439 S3) the page is in roster
 * order for that rule (see _rosterCmp).
 * @returns {{ online: string[] } | { total: number, matched: number, users: object[] }}
 */
function queryOnlineUsers({ q, offset, ids, rule } = {}) {
  if (Array.isArray(ids)) {
    const online = ids.slice(0, ONLINE_PAGE_SIZE).filter((id) => typeof id === 'string' && isVisiblyOnline(id));
    return { online }; // O(ids): no pass over the online list
  }
  const visible = _visibleOnlineUsers();
  const needle = typeof q === 'string' ? q.trim().toLowerCase().slice(0, 40) : '';
  const hits = needle ? visible.filter((u) => String(u.displayName).toLowerCase().includes(needle)) : visible;
  const from = Math.min(Math.max(parseInt(offset, 10) || 0, 0), hits.length);
  const cmp = LOBBY_RULES.includes(rule) ? _rosterCmp(rule) : _byName;
  const users = (from === 0 ? _firstByName(hits, ONLINE_PAGE_SIZE, cmp) : hits.slice().sort(cmp).slice(from, from + ONLINE_PAGE_SIZE)).map(_onlineEntry);
  return { total: visible.length, matched: hits.length, users };
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
 * #439: the lobby mirrors one page of rooms PER RULE TAB. `lobby:subscribe {rule}` puts the socket in
 * that rule's channel; no (or an unknown) rule = the every-rule channel, i.e. the pre-#439 lobby (kept
 * for the current client until the H lobby ships). Socket rooms: 'lobby' = everyone in the lobby
 * (online-list patches), `lobby:<rule>` / 'lobby:all' = that channel's room patches.
 */
const LOBBY_RULES = WINNING_RULES;
const LOBBY_ALL = '';
const LOBBY_ROOM = 'lobby';
/** Channel key for a requested rule: the rule id, or LOBBY_ALL. */
function lobbyChannelOf(rule) { return LOBBY_RULES.includes(rule) ? rule : LOBBY_ALL; }
function lobbyRoomOf(key) { return key ? `lobby:${key}` : 'lobby:all'; }
const LOBBY_ROOMS = [LOBBY_ROOM, lobbyRoomOf(LOBBY_ALL), ...LOBBY_RULES.map(lobbyRoomOf)];
/** Leave the lobby and every rule channel (entering a room, re-subscribing to another tab). */
function leaveLobby(socket) {
  for (const room of LOBBY_ROOMS) socket.leave(room);
}

/**
 * Per-io lobby state. `tally` = counts over ALL rooms (roomId → rank, plus sums overall, per rule and
 * the seated players of running games), kept incrementally by dirty flushes and rebuilt by full ones.
 * `channels` = channel key → `{ page, statsKey }`: `page` is what that channel's clients were last told,
 * roomId → `{ json, rank }`. Diffing against it at flush time is what makes the delta possible without
 * touching the ~15 call sites: they say "something changed", and the flush works out what, by comparing
 * against real state. A call site cannot describe the change wrongly or forget to.
 */
const _lobbyIo = new WeakMap();

function _lobbyState(io) {
  let st = _lobbyIo.get(io);
  if (!st) {
    // The every-rule channel exists from the start (a flush before any subscribe seeds its baseline,
    // as the single pre-#439 channel did); a channel nobody listens to is dropped at the next flush.
    st = { tally: null, dirty: undefined, lastFull: 0, channels: new Map([[LOBBY_ALL, { page: null, statsKey: '' }]]) };
    _lobbyIo.set(io, st);
  }
  return st;
}

/** True only when the adapter says nobody is in the channel's socket room (test doubles have no adapter). */
function _lobbyChannelEmpty(io, key) {
  const rooms = io && io.sockets && io.sockets.adapter && io.sockets.adapter.rooms;
  if (!rooms || typeof rooms.get !== 'function') return false;
  const members = rooms.get(lobbyRoomOf(key));
  return !members || members.size === 0;
}

/**
 * #382: the lobby mirrors at most this many rooms live per channel (snapshot + patches). With more rooms
 * than that, clients page the rest on demand (`queryLobbyRooms`). The full list per subscriber was
 * O(rooms) bytes each (3 MB at 5 000 games).
 */
const LOBBY_ROOM_PAGE_SIZE = config.LOBBY_ROOM_PAGE_SIZE;

const _zeroSum = () => ({ rooms: 0, open: 0, live: 0, watch: 0 });
function _newTally() {
  const rule = {};
  for (const r of LOBBY_RULES) rule[r] = _zeroSum();
  return { per: new Map(), all: _zeroSum(), rule, playing: 0 };
}

/** What a room counts as, and how it ranks for a page slot — same predicates as the lobby client. */
function _lobbyRank(stat) {
  const live = stat.state === 'playing';
  return {
    open: !live && stat.playerCount < 2,
    live,
    watch: Math.max(0, stat.userCount - stat.playerCount),
    rule: stat.rule,
    seated: live ? stat.playerCount : 0, // #439 S6: "đang chơi" counts players, not games
  };
}

function _sumAdd(sum, r, k) {
  sum.rooms += k; sum.open += r.open ? k : 0; sum.live += r.live ? k : 0; sum.watch += r.watch * k;
}
function _tallyAdd(tally, r, k) {
  _sumAdd(tally.all, r, k);
  if (tally.rule[r.rule]) _sumAdd(tally.rule[r.rule], r, k);
  tally.playing += r.seated * k;
}
function _tallySet(tally, roomId, rank) {
  const old = tally.per.get(roomId);
  if (old) _tallyAdd(tally, old, -1);
  if (!rank) { tally.per.delete(roomId); return; }
  tally.per.set(roomId, rank); // an existing key keeps its (creation-order) position
  _tallyAdd(tally, rank, 1);
}

function _countAllRooms() {
  const tally = _newTally();
  for (const room of roomManager.rooms.values()) _tallySet(tally, room.roomId, _lobbyRank(roomManager.lobbyStat(room)));
  return tally;
}

const _inChannel = (rank, key) => !key || rank.rule === key;
const _channelSum = (tally, key) => (key ? tally.rule[key] : tally.all);

/**
 * The counts a channel's clients get: its own rule's (or all) `{ rooms, open, live, watch }`, plus
 * `playing` (seated players in running games, S6) and `byRule` (`{ rule: { open, total } }`, the tab
 * badges, S4), both over ALL rooms.
 */
function _lobbyStats(tally, key) {
  const byRule = {};
  for (const r of LOBBY_RULES) byRule[r] = { open: tally.rule[r].open, total: tally.rule[r].rooms };
  return { ..._channelSum(tally, key), playing: tally.playing, byRule };
}

/**
 * Stats to send with a channel's snapshot/patch. A rule channel always carries them (the tabs need the
 * other rules' counts even when this rule fits one page). The every-rule channel keeps the #382 rule:
 * only while its page is not the whole list, so a small lobby keeps the pre-#382 payload.
 */
function _channelStats(tally, ch, key) {
  if (!key && tally.all.rooms <= ch.page.size) return null;
  return _lobbyStats(tally, key);
}

/** Open tables first (someone can sit), then the most watched; ties keep creation order. */
const _lobbyBetter = (a, b) => (a.open !== b.open ? a.open : a.watch > b.watch);

/** The `count` best-ranked room ids of channel `key` that are not in `exclude` (a Map or Set of ids). */
function _lobbyBestOutside(tally, exclude, count, key) {
  const best = []; // [roomId, rank], best first
  for (const [roomId, rank] of tally.per) {
    if (exclude.has(roomId) || !_inChannel(rank, key)) continue;
    if (best.length === count && !_lobbyBetter(rank, best[count - 1][1])) continue;
    let i = best.length;
    while (i > 0 && _lobbyBetter(rank, best[i - 1][1])) i--;
    best.splice(i, 0, [roomId, rank]);
    if (best.length > count) best.pop();
  }
  return best.map(([roomId]) => roomId);
}

/** The page card to give up for a newly open table: a non-open one with the fewest watchers. */
function _lobbyEvictable(page) {
  let victim = null;
  let fewest = Infinity;
  for (const [roomId, base] of page) {
    if (base.rank.open || base.rank.watch >= fewest) continue;
    victim = roomId;
    fewest = base.rank.watch;
  }
  return victim;
}

/** Record `entry` as the new baseline in `into`; return what to send for it (null = unchanged). */
function _lobbyUpsert(prev, entry, into, rank) {
  const json = JSON.stringify(entry);
  into.set(entry.roomId, { json, rank });
  return prev && prev.json === json ? null : entry;
}

/** #380: only the rooms a call site named — O(changed rooms), not O(all rooms), per flush. */
function _diffLobbyDirty(tally, ch, key, dirty) {
  const page = ch.page;
  const upserts = [];
  const removed = [];
  let freed = false;
  for (const roomId of dirty) {
    const rank = tally.per.get(roomId);
    const room = rank ? roomManager.getRoom(roomId) : null;
    if (!room || !_inChannel(rank, key)) { // gone, or its rule moved it to another tab
      if (page.delete(roomId)) { removed.push(roomId); freed = true; }
      continue;
    }
    if (!page.has(roomId) && page.size >= LOBBY_ROOM_PAGE_SIZE) {
      // #382 full page: only a table someone can sit at displaces a card, and only a non-open one.
      const victim = rank.open ? _lobbyEvictable(page) : null;
      if (!victim) continue;
      page.delete(victim);
      removed.push(victim);
    }
    const upsert = _lobbyUpsert(page.get(roomId), roomManager.lobbyEntry(room), page, rank);
    if (upsert) upserts.push(upsert);
  }
  // A card left the page and rooms are waiting outside it → pull the best ones in (one pass over
  // the tally, only on this edge).
  if (freed && _channelSum(tally, key).rooms > page.size) {
    for (const roomId of _lobbyBestOutside(tally, page, LOBBY_ROOM_PAGE_SIZE - page.size, key)) {
      const room = roomManager.getRoom(roomId);
      if (!room) continue;
      upserts.push(_lobbyUpsert(undefined, roomManager.lobbyEntry(room), page, tally.per.get(roomId)));
    }
  }
  // A card updated earlier in this pass may have been evicted later in it; clients apply removals
  // first, so its upsert would put it back.
  return { upserts: removed.length ? upserts.filter((u) => page.has(u.roomId)) : upserts, removed };
}

/** Every room of the channel re-ranked from the tally; entries are built for the page only. */
function _diffLobbyFull(tally, ch, key) {
  const before = ch.page || new Map();
  let ids;
  if (_channelSum(tally, key).rooms <= LOBBY_ROOM_PAGE_SIZE) {
    // One page or less: every room, in the rooms' own (creation) order — as the lobby always listed them.
    ids = [];
    for (const [roomId, rank] of tally.per) if (_inChannel(rank, key)) ids.push(roomId);
  } else {
    // Page membership is sticky: a card already shown stays while its room lives, so the list does
    // not reshuffle under the reader. Free slots go to the best-ranked rooms outside, and an open
    // table waiting outside takes the place of the least-watched card that is not open.
    ids = [];
    for (const roomId of before.keys()) {
      const rank = tally.per.get(roomId);
      if (rank && _inChannel(rank, key) && ids.length < LOBBY_ROOM_PAGE_SIZE) ids.push(roomId);
    }
    const kept = new Set(ids);
    for (const roomId of _lobbyBestOutside(tally, kept, LOBBY_ROOM_PAGE_SIZE, key)) {
      if (ids.length < LOBBY_ROOM_PAGE_SIZE) { ids.push(roomId); continue; }
      if (!tally.per.get(roomId).open) break;
      let victim = -1;
      for (let i = 0; i < ids.length; i++) {
        const r = tally.per.get(ids[i]);
        if (!r.open && (victim < 0 || r.watch < tally.per.get(ids[victim]).watch)) victim = i;
      }
      if (victim < 0) break;
      ids[victim] = roomId;
    }
  }

  const next = new Map();
  const upserts = [];
  for (const roomId of ids) {
    const room = roomManager.getRoom(roomId);
    if (!room) continue;
    const upsert = _lobbyUpsert(before.get(roomId), roomManager.lobbyEntry(room), next, tally.per.get(roomId));
    if (upsert) upserts.push(upsert);
  }
  const removed = [];
  for (const roomId of before.keys()) {
    if (!next.has(roomId)) removed.push(roomId);
  }
  ch.page = next;
  return { upserts, removed };
}

// #439 S5 filters of `lobby:rooms_query`. Time buckets as the H mockup: per-move clocks are their own
// bucket, otherwise by the base time.
const LOBBY_TIME_BUCKETS = ['fast', 'mid', 'slow', 'move'];
const LOBBY_SORTS = ['state', 'rank', 'time'];
/** "Gần trình tôi": a seated member within this many Elo of the asker, in the tab's rule. */
const LOBBY_NEAR_ELO = 200;
function _timeBucket(stat) {
  if (stat.timerMode === 'per_move') return 'move';
  return stat.timerSeconds <= 180 ? 'fast' : stat.timerSeconds <= 300 ? 'mid' : 'slow';
}

/**
 * #382/#439 on-demand page of a rule's tables, filtered and sorted on the server.
 * - `rule`: tab (unknown/absent = every rule); `offset` into the filtered order.
 * - `open: true`: tables with a free seat. `time`: array of LOBBY_TIME_BUCKETS (any of them).
 * - `near: true`: a seated member within LOBBY_NEAR_ELO of `viewer` in `rule` (ignored without a rule
 *   or when the viewer is unrated there).
 * - `sort`: 'state' (default) = the page order (open first, then most watched); 'rank' = best seated
 *   Elo first, tables without a rated member last; 'time' = shortest time bucket, then base time.
 * Entries are a one-off copy — no patches follow for them. Ratings come from rank-cache (no DB).
 * @returns {{ rooms: object[], matched: number, stats: object }}
 */
function queryLobbyRooms({ rule, offset, open, time, near, sort } = {}, viewer = null) {
  const key = lobbyChannelOf(rule);
  const tally = _newTally();
  const rows = [];
  for (const room of roomManager.rooms.values()) {
    const stat = roomManager.lobbyStat(room);
    const rank = _lobbyRank(stat);
    _tallySet(tally, room.roomId, rank);
    if (_inChannel(rank, key)) rows.push({ roomId: room.roomId, rank, stat });
  }

  const buckets = Array.isArray(time) ? new Set(time.slice(0, LOBBY_TIME_BUCKETS.length).filter((t) => LOBBY_TIME_BUCKETS.includes(t))) : null;
  const mine = near === true && key && viewer && !viewer.isGuest ? rankCache.standingOf(viewer.userId, key) : null;
  const elos = (stat) => {
    const out = [];
    for (const id of stat.seatIds || []) {
      const s = rankCache.standingOf(id, stat.rule);
      if (s) out.push(s[0]);
    }
    return out;
  };
  let hits = rows;
  if (open === true) hits = hits.filter((r) => r.rank.open);
  if (buckets && buckets.size) hits = hits.filter((r) => buckets.has(_timeBucket(r.stat)));
  if (mine) hits = hits.filter((r) => elos(r.stat).some((e) => Math.abs(e - mine[0]) <= LOBBY_NEAR_ELO));

  // Array.prototype.sort is stable, so ties keep creation order — the same order _lobbyBestOutside gives.
  const byState = (a, b) => (_lobbyBetter(a.rank, b.rank) ? -1 : _lobbyBetter(b.rank, a.rank) ? 1 : 0);
  const how = LOBBY_SORTS.includes(sort) ? sort : 'state';
  if (how === 'rank') {
    for (const r of hits) r.best = Math.max(-Infinity, ...elos(r.stat));
    hits = hits.slice().sort((a, b) => (a.best === b.best ? byState(a, b) : b.best - a.best));
  } else if (how === 'time') {
    const order = (r) => LOBBY_TIME_BUCKETS.indexOf(_timeBucket(r.stat));
    hits = hits.slice().sort((a, b) => order(a) - order(b) || a.stat.timerSeconds - b.stat.timerSeconds || byState(a, b));
  } else {
    hits = hits.slice().sort(byState);
  }

  const from = Math.min(Math.max(parseInt(offset, 10) || 0, 0), hits.length);
  const rooms = [];
  for (const { roomId } of hits.slice(from, from + LOBBY_ROOM_PAGE_SIZE)) {
    const room = roomManager.getRoom(roomId);
    if (room) rooms.push(roomManager.lobbyEntry(room));
  }
  return { rooms, matched: hits.length, stats: _lobbyStats(tally, key) };
}

/**
 * #380: which rooms the pending flush must look at — `st.dirty`, a Set of room ids, or 'all' once any
 * caller did not name a room. The diff itself still reads live state at flush time — callers say
 * *which* room may have changed, never *what* changed. One dirty set per io serves every channel.
 *
 * A dirty-only flush cannot see a change nobody announced (a seated player's new avatar), so a flush
 * this long after the last full diff is a full one again.
 */
const LOBBY_FULL_RECONCILE_MS = 30_000;

function _markLobbyDirty(io, roomId) {
  const st = _lobbyState(io);
  if (st.dirty === 'all') return;
  if (typeof roomId !== 'string' || !roomId) { st.dirty = 'all'; return; }
  if (st.dirty) st.dirty.add(roomId); else st.dirty = new Set([roomId]);
}

/**
 * Send channel `key`'s page to one socket, and seed that channel's delta baseline.
 *
 * A client joining mid-stream must receive a complete snapshot once before any
 * patch can mean anything — see LobbyHandler's `lobby:subscribe`.
 */
function sendLobbySnapshot(io, socket, key = LOBBY_ALL) {
  const st = _lobbyState(io);
  if (!st.tally) { st.tally = _countAllRooms(); st.lastFull = Date.now(); } // a full count, as a full flush
  let ch = st.channels.get(key);
  if (!ch) { ch = { page: null, statsKey: '' }; st.channels.set(key, ch); }
  if (!ch.page) {
    // No baseline yet → build it as a full flush would (its upserts are discarded: nobody holds anything
    // to patch). Rooms changed since the last flush are still in st.dirty for the next one.
    _diffLobbyFull(st.tally, ch, key);
    const stats = _channelStats(st.tally, ch, key);
    ch.statsKey = stats ? JSON.stringify(stats) : '';
  }
  const rooms = [];
  for (const roomId of ch.page.keys()) {
    const room = roomManager.getRoom(roomId);
    if (room) rooms.push(roomManager.lobbyEntry(room)); // destroyed since the last flush: its `removed` is on the way
  }
  const payload = { rooms, serverTime: Date.now() };
  const stats = _channelStats(st.tally, ch, key);
  if (stats) payload.stats = stats;
  socket.emit('lobby:update', payload);
}

/**
 * #439: rank-cache rebuilt after a rating write. The online roster carries every member's rank/Elo
 * (any rank may have moved, the diff finds which), and a seated member's card shows their Elo.
 * @param {Set<string>|string[]} changedUserIds  members whose Elo / provisional flag changed
 */
function onRatingsChanged(io, changedUserIds) {
  broadcastOnlineUsers(io);
  for (const userId of changedUserIds) {
    const roomId = roomManager.getRoomIdByUser(userId);
    if (roomId) broadcastLobbyUpdate(io, roomId);
  }
}

// home-feed requires this module, so it can't be a top-level require; memoized because a cached
// require() still resolves the path each call (~15 µs under load: 40 ms per 1k-socket storm, #396).
let _homeFeedMod = null;
function _homeFeed() { return _homeFeedMod || (_homeFeedMod = require('./home-feed')); }

/**
 * Broadcast what changed in the room list to everyone in the lobby (debounced).
 *
 * Sends `lobby:patch` — `{ upserts, removed, stats? }` — per channel instead of the whole list.
 * Both operations are idempotent by design: re-sending an entry a client
 * already has is a no-op, and removing a roomId it never had is a no-op. That
 * matters because a socket that subscribes between two flushes gets a snapshot
 * which may already include a change the next patch also carries.
 *
 * Emits nothing to a channel when nothing in it (or its counts) changed.
 */
function broadcastLobbyUpdate(io, roomId) {
  _homeFeed().scheduleHomeUpdate(io); // B225: playing count + live list
  _markLobbyDirty(io, roomId); // #380: no roomId → full diff
  _scheduleLobbyFlush(io);
}

function _scheduleLobbyFlush(io) {
  if (_lobbyUpdateTimers.has(io)) return; // a broadcast is already scheduled for this burst
  const timeout = setTimeout(() => _flushLobbyNow(io), LOBBY_UPDATE_DEBOUNCE_MS);
  _lobbyUpdateTimers.set(io, timeout);
}

/** Update the counts once, then diff + emit each channel. */
function _flushLobbyNow(io) {
  const pending = _lobbyUpdateTimers.get(io);
  if (pending) { clearTimeout(pending); _lobbyUpdateTimers.delete(io); }
  const st = _lobbyState(io);
  const dirty = st.dirty;
  st.dirty = undefined;
  const now = Date.now();
  const full = !st.tally || !(dirty instanceof Set) || now - st.lastFull >= LOBBY_FULL_RECONCILE_MS;
  if (full) {
    st.tally = _countAllRooms();
    st.lastFull = now;
  } else {
    for (const roomId of dirty) {
      const room = roomManager.getRoom(roomId);
      _tallySet(st.tally, roomId, room ? _lobbyRank(roomManager.lobbyStat(room)) : null);
    }
  }
  for (const [key, ch] of st.channels) {
    if (_lobbyChannelEmpty(io, key)) { st.channels.delete(key); continue; } // its next subscriber reseeds it
    const { upserts, removed } = full || !ch.page ? _diffLobbyFull(st.tally, ch, key) : _diffLobbyDirty(st.tally, ch, key, dirty);
    const stats = _channelStats(st.tally, ch, key);
    const statsKey = stats ? JSON.stringify(stats) : '';
    const statsChanged = statsKey !== ch.statsKey;
    ch.statsKey = statsKey;
    if (upserts.length === 0 && removed.length === 0 && !statsChanged) continue;
    const patch = { upserts, removed, serverTime: Date.now() };
    if (stats) patch.stats = stats;
    io.to(lobbyRoomOf(key)).emit('lobby:patch', patch);
  }
}

/**
 * Per-io record of what lobby clients were last told about online users:
 * userId → serialized entry. Same technique as the lobby room pages (`_lobbyIo`, #230).
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

  // #381: only the first page is mirrored on clients; a user pushed off it by an earlier name is
  // `left` for them (the count comes from `total`).
  const page = getOnlineUsersPage();
  for (const entry of page.users) {
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

  const prevTotal = _onlineTotals.get(io);
  _onlineSnapshots.set(io, next);
  _onlineSnapshotSeen.delete(io);
  _onlineTotals.set(io, page.total);
  _onlinePageCache.delete(io); // a snapshot older than this baseline would miss what this patch carries
  // `total` rides along only while the list is truncated (or just stopped being), so a site that
  // fits one page keeps the exact pre-#381 payload.
  const truncated = page.total > page.users.length;
  const patch = { joined, left };
  if (truncated) patch.total = page.total;
  const changed = joined.length > 0 || left.length > 0 || (truncated && prevTotal !== page.total);
  return { patch, changed };
}

/** Per-io `total` as of the last flush. */
const _onlineTotals = new WeakMap();
/**
 * Per-io first page reused across subscribes for ONLINE_PAGE_CACHE_MS: building it is O(online), and
 * lobby opens arrive in bursts. Dropped at every flush (see _diffOnlineUsers) — a cached page must
 * never be older than the patch baseline.
 */
const _onlinePageCache = new WeakMap();
const ONLINE_PAGE_CACHE_MS = 250;

/**
 * Send the full online list to one socket (on `lobby:subscribe`), and seed the
 * delta baseline. Every later `lobby:online_patch` is a delta against it.
 */
function sendOnlineSnapshot(io, socket) {
  const now = Date.now();
  let cached = _onlinePageCache.get(io);
  if (!cached || now - cached.at >= ONLINE_PAGE_CACHE_MS) {
    cached = { at: now, ...getOnlineUsersPage() };
    _onlinePageCache.set(io, cached);
  }
  const { users, total } = cached;
  socket.emit('lobby:online_users', users);
  // #381: more online than the page holds → tell this socket the real count.
  if (total > users.length) socket.emit('lobby:online_patch', { joined: [], left: [], total });
  if (!_onlineSnapshots.has(io)) {
    const baseline = new Map();
    for (const entry of users) baseline.set(entry.userId, JSON.stringify(entry));
    _onlineSnapshots.set(io, baseline);
    _onlineTotals.set(io, total);
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
  _homeFeed().scheduleHomeUpdate(io); // B225: online count
  if (_onlineUsersTimers.has(io)) return; // a broadcast is already scheduled for this burst
  const timeout = setTimeout(() => {
    _onlineUsersTimers.delete(io);
    const { patch, changed } = _diffOnlineUsers(io);
    if (!changed) return;
    io.to(LOBBY_ROOM).emit('lobby:online_patch', patch);
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

/**
 * Per-room flush due time (ms, Date.now) for broadcastRoomUpdate(): roomId → dueAt. Insertion order is
 * due order (the delay is constant), and ONE shared timer serves the head (#388): a reconnect storm used
 * to arm hundreds of per-room 80 ms timers in one tick, which all expired in a single timer pass and
 * flushed every room back-to-back (~50 ms stall). _drainRoomUpdates flushes in budgeted chunks instead.
 */
const _roomUpdateDue = new Map();
/** Longest stretch one drain pass may run before yielding to I/O with setImmediate (#388). */
const ROOM_UPDATE_FLUSH_BUDGET_MS = 5;
const { performance: _perf } = require('perf_hooks'); // real clock even under jest fake timers
let _roomUpdateTimer = null;
let _roomUpdateImmediate = null;

function _armRoomUpdateFlush() {
  if (_roomUpdateTimer || _roomUpdateImmediate) return;
  const head = _roomUpdateDue.values().next();
  if (head.done) return;
  _roomUpdateTimer = setTimeout(_drainRoomUpdates, Math.max(0, head.value - Date.now()));
}

function _drainRoomUpdates() {
  _roomUpdateTimer = null;
  _roomUpdateImmediate = null;
  const start = _perf.now();
  const now = Date.now() + 1; // a timer can fire a hair before Date.now() reaches its due ms
  for (const [roomId, due] of _roomUpdateDue) {
    if (due > now) break;
    if (_perf.now() - start >= ROOM_UPDATE_FLUSH_BUDGET_MS) {
      _roomUpdateImmediate = setImmediate(_drainRoomUpdates); // let socket reads/writes run, then continue
      return;
    }
    _flushRoomUpdate(roomId);
  }
  _armRoomUpdateFlush();
}

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
  _roomUpdateDue.delete(roomId);
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

  if (_roomUpdateDue.has(roomId)) return; // a flush is already scheduled for this burst
  _roomUpdateDue.set(roomId, Date.now() + ROOM_UPDATE_DEBOUNCE_MS);
  _armRoomUpdateFlush();
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

  _roomUpdateDue.delete(roomId);
  _roomUpdatePending.delete(roomId);
  if (_roomUpdateDue.size === 0 && _roomUpdateTimer) { clearTimeout(_roomUpdateTimer); _roomUpdateTimer = null; }
}

/**
 * userId → Set<socket>: every live socket of a user (#383). `sessions` holds only the NEWEST one;
 * a user briefly has two while the old socket drains after a reconnect / second login, and
 * DisconnectHandler must still see the other one. Maintained by SocketHandler at connect and at
 * the socket's 'disconnect' — the same lifetime as io.sockets.sockets, without the scan.
 */
const _userSockets = new Map();

/** @param {import('socket.io').Socket} socket */
function trackSocket(socket) {
  const userId = socket && socket.user && socket.user.userId;
  if (!userId) return;
  let set = _userSockets.get(userId);
  if (!set) { set = new Set(); _userSockets.set(userId, set); }
  set.add(socket);
}

/** @param {import('socket.io').Socket} socket */
function untrackSocket(socket) {
  const userId = socket && socket.user && socket.user.userId;
  const set = userId && _userSockets.get(userId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) _userSockets.delete(userId);
}

/**
 * Find all active Socket.io sockets belonging to a given userId — O(that user's sockets), from
 * the index above (it used to scan io.sockets.sockets: O(n) per disconnect / kick, #383).
 * @param {import('socket.io').Server} _io — unused, kept for the call sites' signature
 * @param {string} userId
 * @param {string} [excludeSocketId] — skip this socket.id (e.g. the caller's own new connection)
 * @returns {import('socket.io').Socket[]} a fresh array
 */
function findSocketsByUserId(_io, userId, excludeSocketId = null) {
  const set = _userSockets.get(userId);
  if (!set) return [];
  const results = [];
  for (const s of set) if (s.id !== excludeSocketId) results.push(s);
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
    broadcastLobbyUpdate(io, roomId);
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
  getOnlineUsersSorted,
  getOnlineUsersCount,
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
  LOBBY_ROOM,
  LOBBY_RULES,
  lobbyChannelOf,
  lobbyRoomOf,
  leaveLobby,
  LOBBY_NEAR_ELO,
  onRatingsChanged,
  LOBBY_FULL_RECONCILE_MS,
  LOBBY_ROOM_PAGE_SIZE,
  queryLobbyRooms,
  broadcastOnlineUsers,
  broadcastRoomUpdate,
  clearRoomUpdateSnapshot,
  sendLobbySnapshot,
  sendOnlineSnapshot,
  queryOnlineUsers,
  getOnlineUsersPage,
  ONLINE_PAGE_SIZE,
  ONLINE_PAGE_CACHE_MS,
  findSocketsByUserId,
  trackSocket,
  untrackSocket,
  _userSockets,
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
