'use strict';

/**
 * ChallengeService — friend challenges (#198 slice 3).
 *
 * A challenge is in-memory state (id, from, to, settings, games, stake, expiry) plus a
 * persisted `challenge` notification for the target. Accepting turns it into a
 * seated room via PairRoom (same path as quick match) — A = challenger in slot 1,
 * B = accepter in slot 2. Neither side needs a live socket: room pages rejoin by
 * user id on connect; `hooks.onSeated` lets SocketHandler redirect whoever IS
 * connected. A seated user who never shows up is released after SEAT_GRACE_MS.
 *
 * #222: full create-room settings, best-of-N series (`room.series`, ChallengeSeries)
 * and the Swap Elo stake (guards in checkStake, applied by RatingService.rateSeries).
 * Pending challenges stay in-memory — lost on restart (accepted 2026-10-12).
 *
 * Methods throw ChallengeError(code, status); routes translate it to JSON.
 */

const crypto = require('crypto');
const database = require('../db/database');
const roomManager = require('./RoomManager');
const notifications = require('./NotificationService');
const { seatPair } = require('./PairRoom');
const { RULES, PRESETS } = require('./MatchQueue');
const privacyGate = require('./PrivacyGate');
const ChallengeSeries = require('./ChallengeSeries');
const RatingService = require('./RatingService');
const config = require('../config');

const TTL_MS = 2 * 60 * 1000;
const MAX_OUTGOING = 5;
const SEAT_GRACE_MS = 90 * 1000;

class ChallengeError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

/** id → { id, from, to, settings, games, stake, createdAt, timer } */
const pending = new Map();
let hooks = { onSeated: () => {}, onRoomChanged: () => {}, isOnline: () => false };

/** @param {{onSeated?: (room, userIds) => void, onRoomChanged?: (room) => void, isOnline?: (userId) => boolean}} h */
function setHooks(h) {
  hooks = { onSeated: () => {}, onRoomChanged: () => {}, isOnline: () => false, ...h };
}

const publicUser = (u) => ({
  userId: u.id,
  username: u.username,
  displayName: u.display_name,
  avatarUrl: u.avatar_v ? `/api/profile/avatar/${u.id}.webp?v=${u.avatar_v}` : null,
});

function remove(c, { dropNotification = true } = {}) {
  clearTimeout(c.timer);
  pending.delete(c.id);
  if (dropNotification) notifications.drop(c.to, 'challenge', c.from);
}

const STAKES = ['none', 'swap'];
const TIMER_MODES = ['per_move', 'per_game', 'blitz'];
const bad = (msg) => new ChallengeError('BAD_SETTINGS', 400, msg);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const optBool = (v) => v === undefined || typeof v === 'boolean';

/**
 * Create-room parity (#222): every field checked like the lobby form sends it —
 * unknown values are rejected (not defaulted) so the challenged sees exactly what
 * was proposed — then normalised by RoomManager's own validator.
 * Legacy body `{rule, time, rated}` (B197 chips) maps to a blitz preset.
 */
function parseSettings(body) {
  const raw = body.settings;
  if (raw === undefined || raw === null) {
    if (!RULES.includes(body.rule)) throw new ChallengeError('BAD_RULE', 400, 'Luật không hợp lệ.');
    if (!PRESETS[body.time]) throw new ChallengeError('BAD_TIME', 400, 'Thời gian không hợp lệ.');
    return roomManager._validateSettings({ ...PRESETS[body.time], winningRule: body.rule, ranked: body.rated === true });
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw bad('Cài đặt không hợp lệ.');
  if (!config.VALID_BOARD_SIZES.includes(raw.boardSize)) throw bad('Kích thước bàn không hợp lệ.');
  if (!RULES.includes(raw.winningRule)) throw new ChallengeError('BAD_RULE', 400, 'Luật không hợp lệ.');
  if (!optBool(raw.ruleWall) || !optBool(raw.rulePortal) || !optBool(raw.ruleSwap2) || typeof raw.ranked !== 'boolean') {
    throw bad('Cài đặt không hợp lệ.');
  }
  if (!TIMER_MODES.includes(raw.timerMode)) throw new ChallengeError('BAD_TIME', 400, 'Thời gian không hợp lệ.');
  if (!isInt(raw.timerSeconds, 5, 3600)) throw new ChallengeError('BAD_TIME', 400, 'Thời gian không hợp lệ.');
  const inc = raw.timerIncrementSeconds === undefined ? 0 : raw.timerIncrementSeconds;
  if (!isInt(inc, 0, 600)) throw new ChallengeError('BAD_TIME', 400, 'Thời gian không hợp lệ.');
  return roomManager._validateSettings({
    boardSize: raw.boardSize, winningRule: raw.winningRule, ranked: raw.ranked,
    ruleWall: raw.ruleWall === true, rulePortal: raw.rulePortal === true, ruleSwap2: raw.ruleSwap2 === true,
    timerMode: raw.timerMode, timerSeconds: raw.timerSeconds,
    timerIncrementSeconds: raw.timerMode === 'blitz' ? inc : 0, // increment only ticks in blitz
  });
}

/** Swap Elo guards (all required): rated, both ≥ min rated games in the category, pair cooldown. */
function checkStake(c) {
  if (c.stake !== 'swap') return;
  if (!c.settings.ranked) throw new ChallengeError('STAKE_NEEDS_RATED', 400, 'Cược đổi Elo chỉ dành cho ván xếp hạng.');
  const cat = c.settings.winningRule;
  for (const uid of [c.from, c.to]) {
    if (database.getRatedGames(uid, cat) < config.SWAP_MIN_RATED_GAMES) {
      throw new ChallengeError('STAKE_MIN_GAMES', 409, `Cả hai cần ít nhất ${config.SWAP_MIN_RATED_GAMES} ván xếp hạng ở luật này.`);
    }
  }
  const last = database.lastEloSwapAt(c.from, c.to);
  if (last && Date.now() - Date.parse(last) < config.SWAP_COOLDOWN_MS) {
    throw new ChallengeError('STAKE_COOLDOWN', 409, 'Hai bạn vừa đổi Elo, hãy chờ 24 giờ.');
  }
}

function send(fromId, username, body = {}) {
  const target = database.getUserByUsername(String(username || '').slice(0, 40));
  if (!target) throw new ChallengeError('USER_NOT_FOUND', 404, 'Không tìm thấy người chơi.');
  if (target.id === fromId) throw new ChallengeError('CANNOT_CHALLENGE_SELF', 400, 'Không thể tự thách đấu.');
  if (!privacyGate.allowed(fromId, target.id, 'challenge')) throw new ChallengeError('CHALLENGE_NOT_ALLOWED', 403, 'Người này không nhận thách đấu từ bạn.');
  const settings = parseSettings(body);
  const games = body.games === undefined ? 1 : body.games;
  if (!Number.isInteger(games) || games < 1 || games > config.CHALLENGE_SERIES_MAX_GAMES) throw new ChallengeError('BAD_GAMES', 400, 'Số ván không hợp lệ.');
  const stake = body.stake === undefined ? 'none' : body.stake;
  if (!STAKES.includes(stake)) throw new ChallengeError('BAD_STAKE', 400, 'Kiểu cược không hợp lệ.');
  const c = {
    id: crypto.randomUUID(), from: fromId, to: target.id, settings, games, stake, createdAt: Date.now(),
    time: body.settings == null ? body.time : null, // legacy chip label, shown as-is
  };
  checkStake(c);
  for (const old of [...pending.values()]) if (old.from === fromId && old.to === target.id) remove(old); // re-send replaces
  const outgoing = [...pending.values()].filter((x) => x.from === fromId).length;
  if (outgoing >= MAX_OUTGOING) throw new ChallengeError('TOO_MANY_CHALLENGES', 429, 'Quá nhiều thách đấu đang chờ.');

  const me = database.getUserById(fromId);
  c.timer = setTimeout(() => remove(c), TTL_MS);
  if (c.timer.unref) c.timer.unref();
  pending.set(c.id, c);
  const v = view(c);
  notifications.push(target.id, 'challenge', fromId, {
    from: { username: me.username, displayName: me.display_name },
    challengeId: c.id, rule: v.rule, time: v.time, rated: v.rated, settings: v.settings, games, stake,
  });
  return v;
}

function view(c) {
  return {
    id: c.id, rule: c.settings.winningRule, time: c.time, rated: c.settings.ranked,
    settings: { ...c.settings }, games: c.games, stake: c.stake, expiresAt: c.createdAt + TTL_MS,
  };
}

function list(userId) {
  const out = { incoming: [], outgoing: [] };
  for (const c of pending.values()) {
    if (c.to === userId) out.incoming.push({ ...view(c), from: publicUser(database.getUserById(c.from)) });
    else if (c.from === userId) out.outgoing.push({ ...view(c), to: publicUser(database.getUserById(c.to)) });
  }
  return out;
}

function mustGet(id) {
  const c = pending.get(String(id));
  if (!c) throw new ChallengeError('CHALLENGE_GONE', 404, 'Thách đấu đã hết hạn hoặc bị huỷ.');
  return c;
}

/** Recipient accepts: seat both, return the room. */
function accept(userId, id, ip) {
  const c = mustGet(id);
  if (c.to !== userId) throw new ChallengeError('NOT_YOUR_CHALLENGE', 403, 'Không phải thách đấu của bạn.');
  if (roomManager.getRoomByUser(c.from) || roomManager.getRoomByUser(c.to)) {
    throw new ChallengeError('ALREADY_IN_ANOTHER_ROOM', 409, 'Một trong hai người đang ở trong phòng khác.');
  }
  checkStake(c); // ratings / cooldown may have moved since send
  const a = database.getUserById(c.from);
  const b = database.getUserById(c.to);
  const settings = { ...c.settings, roomName: `${a.display_name} vs ${b.display_name}`.slice(0, 30) };
  const seated = seatPair(
    roomManager,
    { userId: a.id, displayName: a.display_name },
    { userId: b.id, displayName: b.display_name },
    settings,
    ip
  );
  if (seated.error) throw new ChallengeError(seated.code, 409, seated.error);
  remove(c);
  const { room } = seated;
  if (c.games > 1 || c.stake !== 'none') {
    room.series = ChallengeSeries.create({
      players: [a.id, b.id], total: c.games, stake: c.stake,
      rated: c.settings.ranked, category: RatingService.categoryFor(c.settings.winningRule),
    });
  }
  notifications.push(c.from, 'challenge_accepted', c.to, { from: { username: b.username, displayName: b.display_name }, roomId: room.roomId });
  try { hooks.onSeated(room, [a.id, b.id]); } catch (_) { /* redirect is best-effort */ }
  scheduleSeatCheck(room.roomId, [a.id, b.id]);
  return { roomId: room.roomId };
}

/** Free anyone seated by challenge who never connected (no socket, game not started). */
function scheduleSeatCheck(roomId, userIds) {
  const t = setTimeout(() => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.state !== 'idle') return;
    for (const uid of userIds) {
      if (!hooks.isOnline(uid) && roomManager.getRoomByUser(uid) === room) roomManager.leaveRoom(uid);
    }
    if (roomManager.getRoom(roomId)) { try { hooks.onRoomChanged(room); } catch (_) { /* best-effort */ } }
  }, SEAT_GRACE_MS);
  if (t.unref) t.unref();
}

/** Recipient declines or sender cancels. Idempotent for a challenge that is already gone. */
function close(userId, id) {
  const c = pending.get(String(id));
  if (!c) return;
  if (c.to !== userId && c.from !== userId) throw new ChallengeError('NOT_YOUR_CHALLENGE', 403, 'Không phải thách đấu của bạn.');
  remove(c);
}

function _reset() {
  for (const c of pending.values()) clearTimeout(c.timer);
  pending.clear();
}

module.exports = {
  ChallengeError, TTL_MS, MAX_OUTGOING, SEAT_GRACE_MS, setHooks, send, list, accept, close, _reset,
};
