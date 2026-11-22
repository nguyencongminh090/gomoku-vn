'use strict';
/**
 * #435 — the room page now acks + resends chat (an emit into a silently dead socket was lost), so the
 * socket handler must ack every chat:message and drop a repeated client id (even on a new socket).
 */
jest.mock('../managers/RoomManager', () => ({ getRoomIdByUser: jest.fn(), getRoom: jest.fn(() => ({})) }));
jest.mock('../managers/ChatHandler', () => ({ handleMessage: jest.fn(), handleReaction: jest.fn() }));

const roomManager = require('../managers/RoomManager');
const chatManager = require('../managers/ChatHandler');
const { register, _seenCids } = require('../socket/handlers/ChatHandler');

function mkSocket(userId = 'u1') {
  const h = {};
  return { user: { userId, displayName: 'A' }, on: (e, cb) => { h[e] = cb; }, emit: jest.fn(), h };
}

beforeEach(() => {
  jest.clearAllMocks();
  _seenCids.clear();
  roomManager.getRoomIdByUser.mockReturnValue('R1');
});

test('acks a delivered message', () => {
  const s = mkSocket(); register({}, s);
  const ack = jest.fn();
  s.h['chat:message']({ text: 'hi', cid: 'c1' }, ack);
  expect(chatManager.handleMessage).toHaveBeenCalledTimes(1);
  expect(ack).toHaveBeenCalledWith({ ok: true });
});

test('same cid again (resend after a lost ack, on a NEW socket) → acked, not broadcast twice', () => {
  const s1 = mkSocket(); register({}, s1);
  s1.h['chat:message']({ text: 'hi', cid: 'c1' }, jest.fn());
  const s2 = mkSocket(); register({}, s2);
  const ack = jest.fn();
  s2.h['chat:message']({ text: 'hi', cid: 'c1' }, ack);
  expect(chatManager.handleMessage).toHaveBeenCalledTimes(1);
  expect(ack).toHaveBeenCalledWith({ ok: true, dup: true });
});

test('same cid from a different user is not a duplicate', () => {
  const a = mkSocket('u1'); register({}, a);
  const b = mkSocket('u2'); register({}, b);
  a.h['chat:message']({ text: 'x', cid: 'c1' }, jest.fn());
  b.h['chat:message']({ text: 'x', cid: 'c1' }, jest.fn());
  expect(chatManager.handleMessage).toHaveBeenCalledTimes(2);
});

test.each([[undefined], [''], [42], ['x'.repeat(65)]])('no usable cid (%p) → never deduped (old clients)', (cid) => {
  const s = mkSocket(); register({}, s);
  s.h['chat:message']({ text: 'a', cid });
  s.h['chat:message']({ text: 'a', cid });
  expect(chatManager.handleMessage).toHaveBeenCalledTimes(2);
});

test('no ack callback and null payload do not throw', () => {
  const s = mkSocket(); register({}, s);
  expect(() => s.h['chat:message'](null)).not.toThrow();
  expect(() => s.h['chat:message']({ text: 'a', cid: 'c9' })).not.toThrow();
});

test('not in a room → chat:error and ack ok:false', () => {
  roomManager.getRoomIdByUser.mockReturnValue(null);
  const s = mkSocket(); register({}, s);
  const ack = jest.fn();
  s.h['chat:message']({ text: 'hi', cid: 'c1' }, ack);
  expect(s.emit).toHaveBeenCalledWith('chat:error', expect.objectContaining({ code: 'MUST_BE_IN_ROOM_TO_CHAT' }));
  expect(ack).toHaveBeenCalledWith({ ok: false });
});

test('memory is bounded: 20 cids per user, oldest forgotten', () => {
  const s = mkSocket(); register({}, s);
  for (let i = 0; i < 21; i++) s.h['chat:message']({ text: 't', cid: 'c' + i }, jest.fn());
  expect(_seenCids.get('u1')).toHaveLength(20);
  s.h['chat:message']({ text: 't', cid: 'c0' }, jest.fn()); // forgotten → delivered again
  expect(chatManager.handleMessage).toHaveBeenCalledTimes(22);
});

