'use strict';

/**
 * presence/index.js — reads the live stores and answers status questions through presence-core (#487).
 *
 * Stores stay where they are (state.js: sessions, awayUsers, heartbeats, hiddenOnline, grace timers;
 * RoomManager: rooms; MatchHandler: queue; tournamentState: live matches). Required lazily, because
 * state.js itself delegates its presence predicates to presence-core and is loaded first.
 */

const core = require('./presence-core');

const _state = () => require('../socket/state');
const _rooms = () => require('../managers/RoomManager');

/** Injected by SocketHandler.init (MatchHandler / tournament state); tests may override. */
let hooks = { isQueued: () => false, inTournament: () => false };
function setHooks(h = {}) { hooks = { ...hooks, ...h }; }

/** Site-wide facts for one user, as presence-core takes them. */
function facts(userId) {
  const st = _state();
  return {
    hasSocket: st.sessions.has(userId),
    socketAway: st.awayUsers.has(userId),
    beat: st.heartbeats.get(userId) || null,
    hidden: st.isHiddenOnline(userId),
    inGrace: st.disconnectTimers.has(userId) || st.spectatorGraceTimers.has(userId) || st.emptyRoomGraceTimers.has(userId),
  };
}

/** A socket is registered — the challenge seat check's "did they connect?" (#372 review). */
function hasSocket(userId) { return _state().sessions.has(userId); }

/** A live push (DM, bell) can land without a bell entry (#372 review). */
function canPushLive(userId) { return core.hasPresentSocket(facts(userId)); }

function isVisiblyOnline(userId) { return core.isVisiblyOnline(facts(userId)); }

/** Deadline (ms) of the user's pending grace, if any — for a countdown (planning §2b). */
function graceUntil(userId) {
  const st = _state();
  for (const m of [st.disconnectTimers, st.spectatorGraceTimers, st.emptyRoomGraceTimers]) {
    const e = m.get(userId);
    if (e && typeof e.until === 'number') return e.until;
  }
  return null;
}

function activityOf(userId) {
  return core.activityOf(userId, {
    room: _rooms().getRoomByUser(userId),
    queued: !!hooks.isQueued(userId),
    tournament: !!hooks.inTournament(userId),
  });
}

/** Full user-scope status. */
function userStatus(userId, now = Date.now()) {
  const f = facts(userId);
  return { ...core.userConn(f, now), activity: activityOf(userId), hidden: f.hidden };
}

/** Wire `st` for one audience (planning §2c/§2d). */
function statusOf(userId, audience = 'public', now = Date.now()) {
  return core.project(userStatus(userId, now), audience);
}

module.exports = { setHooks, facts, hasSocket, canPushLive, isVisiblyOnline, graceUntil, activityOf, userStatus, statusOf };
