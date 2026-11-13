'use strict';

/** #368 — room:updated carries gameLog only when it changed (like scoreTable). */
jest.useFakeTimers(); // before the requires: RoomManager/state start intervals at load
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const roomManager = require('../managers/RoomManager');
const state = require('../socket/state');

test('gameLog rides room:updated only when it changed', () => {
  const { room } = roomManager.createRoom({ userId: 'h2', displayName: 'H', isGuest: true, ip: '8.8.8.8' });
  const sent = [];
  const io = { to: () => ({ emit: (ev, data) => sent.push({ ev, data }) }) };
  const flush = () => { state.broadcastRoomUpdate(io, room); jest.runOnlyPendingTimers(); };
  flush();
  expect(sent.at(-1).data.gameLog).toEqual([]);
  flush();
  expect(sent.at(-1).data).not.toHaveProperty('gameLog');
  room.gameLog.push({ n: 1, winnerId: 'draw' });
  flush();
  expect(sent.at(-1).data.gameLog).toEqual([{ n: 1, winnerId: 'draw' }]);
  state.clearRoomUpdateSnapshot(room.roomId);
  roomManager._destroyRoom(room.roomId);
});
