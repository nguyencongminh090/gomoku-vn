'use strict';

/**
 * presence-core.js — the ONE derivation of player status (features/presence-status, #487).
 *
 * Pure functions over facts; no I/O, no module state. `server/presence/index.js` feeds them the live
 * stores (socket registry, away set, heartbeats, hide-online, rooms, match queue, tournament matches).
 * Every surface that shows or acts on status reads it through here, so no page derives its own variant.
 *
 * Two scopes (planning §2a/§2b), because a user can be on the site and away from the table at once
 * (#373 another page, #422 Back mid-game):
 *   user   { conn: 'online'|'reconnecting'|'offline', attn: 'active'|'away', activity, hidden }
 *   member { at: 'active'|'away'|'gone' } — room.users[].presence on the wire ('gone' = 'disconnected')
 *
 * Wire shape (`st`, planning §2c): { c: 'on'|'re'|'off', a?: 1, k?: activity kind, r?: roomId, t?: since }.
 */

/** A heartbeat counts this long (pages without a socket beat every ~20 s, #372). */
const BEAT_TTL_MS = 45_000;

/** Activity kinds on the wire. */
const KIND = { idle: 'idle', searching: 'search', playing: 'play', watching: 'watch', tournament: 'tour' };

/**
 * Fresh beats of one user, from either shape: per-tab `{ tabs: Map(tabId → {at, away}) }` (#487) or the
 * pre-#487 single `{ at, away }` (kept readable so an entry written by older code still counts).
 * @returns {Array<{at:number, away:boolean}>}
 */
function freshBeats(entry, now) {
  if (!entry) return [];
  const all = entry.tabs instanceof Map ? [...entry.tabs.values()] : [entry];
  return all.filter((b) => b && typeof b.at === 'number' && now - b.at <= BEAT_TTL_MS);
}

/**
 * Site-wide facts → connection + attention.
 * @param {{ hasSocket:boolean, socketAway:boolean, beat:object|null, inGrace?:boolean }} f
 * @returns {{ conn: 'online'|'reconnecting'|'offline', attn: 'active'|'away' }}
 */
function userConn(f, now = Date.now()) {
  const beats = freshBeats(f.beat, now);
  const online = !!f.hasSocket || beats.length > 0;
  if (!online) return { conn: f.inGrace ? 'reconnecting' : 'offline', attn: 'away' };
  // Active if ANY surface is visible+focused: the socket page, or any beat tab (planning U10/U11).
  const active = (f.hasSocket && !f.socketAway) || beats.some((b) => !b.away);
  return { conn: 'online', attn: active ? 'active' : 'away' };
}

/** Present = online and active somewhere (#372 "online" for lists, counts, the challenge picker). */
function isPresent(f, now = Date.now()) {
  const u = userConn(f, now);
  return u.conn === 'online' && u.attn === 'active';
}

/** A live socket whose page is visible+focused — the only place a live push can land (#372 review). */
function hasPresentSocket(f) {
  return !!f.hasSocket && !f.socketAway;
}

/** What other members may be told: present and not hiding it (#199). */
function isVisiblyOnline(f, now = Date.now()) {
  return !f.hidden && isPresent(f, now);
}

// ── Room-member scope ────────────────────────────────────────────────────────

/** @returns {'active'|'away'|'gone'} */
function memberAt(u) {
  if (!u) return 'gone';
  if (u.presence === 'disconnected') return 'gone';
  return u.presence === 'away' ? 'away' : 'active';
}

/** A viewer who left the site: kept in room.users for #115, never counted as occupant (#158/#186). */
function isGhostViewer(u) {
  return !!u && u.slot === null && memberAt(u) === 'gone';
}

/** Still connected to the room (any page): keeps the room alive, may receive the host role. */
function isConnectedMember(u) {
  return memberAt(u) !== 'gone';
}

// ── Activity ─────────────────────────────────────────────────────────────────

/**
 * What the user is doing (planning §2a). Precedence: tournament > playing > searching > watching > idle.
 * Playing includes an interrupted game (a seat in grace): the game is not over (problem 3, planning §1f).
 * @param {string} userId
 * @param {{ room?: object|null, queued?: boolean, tournament?: boolean }} ctx
 * @returns {{ kind: string, roomId?: string, since?: number }}
 */
function activityOf(userId, ctx = {}) {
  if (ctx.tournament) return { kind: 'tournament' };
  const room = ctx.room;
  const u = room && room.users && room.users.get(userId);
  if (u && (u.slot === 1 || u.slot === 2)) {
    const gs = room.gameState;
    const live = gs && gs.status === 'ongoing' && (room.state === 'playing' || room.state === 'interrupted');
    if (live) return { kind: 'playing', roomId: room.roomId, since: gs.startedAt || undefined };
  }
  if (ctx.queued) return { kind: 'searching' };
  if (u && u.slot === null && memberAt(u) !== 'gone') return { kind: 'watching', roomId: room.roomId };
  return { kind: 'idle' };
}

// ── Projection per audience ──────────────────────────────────────────────────

const AUDIENCES = ['self', 'room', 'friend', 'public', 'staff'];

/**
 * The wire shape one audience may see (planning §2d). Hidden-online reads as offline to friends and the
 * public; the room (people at the same table), the user and staff see the truth.
 * @param {{ conn, attn, activity, hidden }} s
 * @param {'self'|'room'|'friend'|'public'|'staff'} audience
 */
function project(s, audience) {
  const aud = AUDIENCES.includes(audience) ? audience : 'public';
  if (s.hidden && (aud === 'friend' || aud === 'public')) return { c: 'off' };
  const c = s.conn === 'online' ? 'on' : s.conn === 'reconnecting' ? 're' : 'off';
  if (c === 'off') return { c };
  const st = { c };
  if (c === 'on' && s.attn === 'away') st.a = 1;
  if (aud === 'public') return st; // strangers: online/away only, never what or where
  const act = s.activity || { kind: 'idle' };
  st.k = KIND[act.kind] || 'idle';
  if (act.roomId) st.r = act.roomId;
  if (act.since) st.t = act.since;
  return st;
}

module.exports = {
  BEAT_TTL_MS, KIND, AUDIENCES,
  freshBeats, userConn, isPresent, hasPresentSocket, isVisiblyOnline,
  memberAt, isGhostViewer, isConnectedMember,
  activityOf, project,
};
