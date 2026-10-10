'use strict';

/**
 * PairRoom.js — turn two users into a seated room (shared by quick match B197
 * and friend challenges #198). No sockets here: A creates the room, B joins,
 * they sit in slots 1/2; callers do the socket-side joins/redirects.
 * The game starts through the usual ready check, so no clock runs before both
 * room pages have loaded.
 */

const logger = require('../utils/logger');

const SEAT_FAILED = { error: 'Không ghép được phòng, hãy thử lại.', code: 'MATCH_ROOM_FAILED' };

/**
 * @param {object} roomManager
 * @param {{userId:string, displayName:string, isGuest?:boolean}} a  room creator, slot 1
 * @param {{userId:string, displayName:string, isGuest?:boolean}} b  slot 2
 * @param {object} settings  room settings (clock preset, winningRule, ranked, roomName)
 * @param {string} [ip]      creator's IP for the per-IP room quota
 * @returns {{room: object} | {error: string, code: string}}
 */
function seatPair(roomManager, a, b, settings, ip) {
  const created = roomManager.createRoom({ userId: a.userId, displayName: a.displayName, isGuest: !!a.isGuest, ip }, settings);
  if (created.error) return { error: created.error, code: created.code };
  const room = created.room;
  const joined = roomManager.joinRoom({ userId: b.userId, displayName: b.displayName, isGuest: !!b.isGuest }, room.roomId);
  const seatA = roomManager.sitDown(a.userId, 1);
  const seatB = joined.error ? joined : roomManager.sitDown(b.userId, 2);
  if (joined.error || seatA.error || seatB.error) {
    logger.warn('[PairRoom] seating failed', { roomId: room.roomId, code: (joined.error ? joined : seatA.error ? seatA : seatB).code });
    if (!joined.error) roomManager.leaveRoom(b.userId);
    roomManager.leaveRoom(a.userId); // last one out destroys the room
    return { ...SEAT_FAILED };
  }
  return { room };
}

module.exports = { seatPair };
