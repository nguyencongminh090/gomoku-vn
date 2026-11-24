'use strict';

/**
 * room-invites-service.test.js — F443 RoomInviteService: host invites an online member to the room,
 * invitee accepts (→ {roomId}, never seated/joined by the service) or declines. Real SQL on an
 * in-memory DB, real RoomManager + NotificationService.
 */

jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const database = require('../db/database');
const config = require('../config');
const notif = require('../managers/NotificationService');
const roomManager = require('../managers/RoomManager');
const svc = require('../managers/RoomInviteService');

const NOW = '2026-11-24T00:00:00.000Z';
const db = database.db;
const U = {};

function addUser(name) {
  const id = `${name}-id`;
  U[name] = id;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`)
    .run(id, name, name.toUpperCase(), NOW);
}
const mkRoom = (as, ip = '9.9.9.9') => roomManager.createRoom({ userId: U[as], displayName: as.toUpperCase(), ip }, {}).room;
const join = (as, room) => roomManager.joinRoom({ userId: U[as], displayName: as.toUpperCase(), isGuest: false }, room.roomId);
const invites = (as) => notif.list(U[as], 50).items.filter((n) => n.type === 'room_invite');
const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

beforeAll(() => { for (const n of ['alice', 'bob', 'carol', 'dave']) addUser(n); });
beforeEach(() => {
  svc._reset();
  db.prepare('DELETE FROM notifications').run();
  db.prepare("UPDATE users SET who_can_challenge = 'everyone'").run();
  roomManager.rooms.clear(); // fillers below are bare entries: reset the maps, don't leaveRoom() through them
  roomManager.userRoomMap.clear();
  notif.setEmitter(() => {});
  svc.setHooks({ onlineUsers: () => [] });
});

describe('send', () => {
  it('stores an invite and pushes a room_invite notification to the target', () => {
    const room = mkRoom('alice');
    const v = svc.send(U.alice, 'bob', room.roomId);
    expect(v).toMatchObject({ roomId: room.roomId, to: { username: 'bob', displayName: 'BOB' } });
    expect(typeof v.id).toBe('string');
    expect(invites('bob')[0]).toMatchObject({
      type: 'room_invite',
      payload: { roomId: room.roomId, roomName: room.roomName, inviteId: v.id, from: { username: 'alice', displayName: 'ALICE' } },
    });
  });

  it('rejects self, unknown user, bad input', () => {
    const room = mkRoom('alice');
    expect(code(() => svc.send(U.alice, 'alice', room.roomId))).toBe('CANNOT_INVITE_SELF');
    expect(code(() => svc.send(U.alice, 'nobody', room.roomId))).toBe('USER_NOT_FOUND');
    expect(code(() => svc.send(U.alice, 5, room.roomId))).toBe('BAD_REQUEST');
    expect(code(() => svc.send(U.alice, 'bob', undefined))).toBe('BAD_REQUEST');
  });

  it('only the host of the room may invite (NOT_HOST) and the sender must be in that room (NOT_IN_ROOM)', () => {
    const room = mkRoom('alice');
    join('carol', room);
    expect(code(() => svc.send(U.carol, 'bob', room.roomId))).toBe('NOT_HOST');
    const other = mkRoom('dave', '8.8.8.8');
    expect(code(() => svc.send(U.alice, 'bob', other.roomId))).toBe('NOT_IN_ROOM');
    expect(code(() => svc.send(U.bob, 'carol', room.roomId))).toBe('NOT_IN_ROOM');
  });

  it('respects the recipient privacy setting (who_can_challenge = nobody)', () => {
    const room = mkRoom('alice');
    db.prepare("UPDATE users SET who_can_challenge = 'nobody' WHERE id = ?").run(U.bob);
    expect(code(() => svc.send(U.alice, 'bob', room.roomId))).toBe('INVITE_NOT_ALLOWED');
  });

  it('does not reveal whether the target is in a room (hidden presence): the invite is created, accept later says ALREADY_IN_ANOTHER_ROOM', () => {
    const room = mkRoom('alice');
    mkRoom('bob', '8.8.8.8');
    const v = svc.send(U.alice, 'bob', room.roomId);
    expect(invites('bob')).toHaveLength(1);
    expect(code(() => svc.accept(U.bob, v.id))).toBe('ALREADY_IN_ANOTHER_ROOM');
  });

  it('refuses when the room is full (ROOM_FULL)', () => {
    const room = mkRoom('alice');
    for (let i = room.users.size; i < config.MAX_USERS_PER_ROOM; i++) room.users.set(`fill-${i}`, { userId: `fill-${i}`, slot: null });
    expect(code(() => svc.send(U.alice, 'bob', room.roomId))).toBe('ROOM_FULL');
  });

  it('caps pending outgoing invites per sender (TOO_MANY_INVITES)', () => {
    const room = mkRoom('alice');
    for (let i = 0; i < svc.MAX_OUTGOING; i++) { addUser(`t${i}`); svc.send(U.alice, `t${i}`, room.roomId); }
    expect(code(() => svc.send(U.alice, 'bob', room.roomId))).toBe('TOO_MANY_INVITES');
  });

  it('a re-send to the same player replaces the old invite: one pending, one notification', () => {
    const room = mkRoom('alice');
    const a = svc.send(U.alice, 'bob', room.roomId);
    jest.advanceTimersByTime(svc.RESEND_COOLDOWN_MS + 1);
    const b = svc.send(U.alice, 'bob', room.roomId);
    expect(b.id).not.toBe(a.id);
    expect(invites('bob')).toHaveLength(1);
    expect(code(() => svc.accept(U.bob, a.id))).toBe('INVITE_GONE');
    expect(svc.accept(U.bob, b.id)).toEqual({ roomId: room.roomId });
  });
});

describe('re-send cooldown', () => {
  it('a second invite to the same player within RESEND_COOLDOWN_MS is refused (INVITE_TOO_SOON); allowed after; other targets unaffected', () => {
    const room = mkRoom('alice');
    const a = svc.send(U.alice, 'bob', room.roomId);
    expect(code(() => svc.send(U.alice, 'bob', room.roomId))).toBe('INVITE_TOO_SOON');
    expect(code(() => svc.send(U.alice, 'carol', room.roomId))).toBeNull();
    expect(invites('bob')).toHaveLength(1);
    expect(code(() => svc.accept(U.bob, a.id))).toBeNull(); // the first invite is untouched by the refused re-send
    jest.advanceTimersByTime(svc.RESEND_COOLDOWN_MS + 1);
    expect(code(() => svc.send(U.alice, 'bob', room.roomId))).toBeNull();
  });
});

describe('accept', () => {
  it('returns {roomId}, consumes the invite and its notification, and does not join or seat anyone', () => {
    const room = mkRoom('alice');
    const v = svc.send(U.alice, 'bob', room.roomId);
    expect(svc.accept(U.bob, v.id)).toEqual({ roomId: room.roomId });
    expect(code(() => svc.accept(U.bob, v.id))).toBe('INVITE_GONE');
    expect(invites('bob')).toHaveLength(0);
    expect(room.users.has(U.bob)).toBe(false);
    expect(roomManager.getRoomByUser(U.bob)).toBeNull();
    expect(room.users.get(U.alice).slot).toBeNull();
  });

  it('only the invitee may accept (NOT_YOUR_INVITE)', () => {
    const v = svc.send(U.alice, 'bob', mkRoom('alice').roomId);
    expect(code(() => svc.accept(U.carol, v.id))).toBe('NOT_YOUR_INVITE');
  });

  it('refuses when the invitee has since entered another room (ALREADY_IN_ANOTHER_ROOM), but the invite survives', () => {
    const v = svc.send(U.alice, 'bob', mkRoom('alice').roomId);
    mkRoom('bob', '8.8.8.8');
    expect(code(() => svc.accept(U.bob, v.id))).toBe('ALREADY_IN_ANOTHER_ROOM');
    roomManager.leaveRoom(U.bob);
    expect(svc.accept(U.bob, v.id).roomId).toBeTruthy();
  });

  it('INVITE_GONE when the room no longer exists', () => {
    const room = mkRoom('alice');
    const v = svc.send(U.alice, 'bob', room.roomId);
    roomManager.rooms.delete(room.roomId);
    expect(code(() => svc.accept(U.bob, v.id))).toBe('INVITE_GONE');
  });

  it('ROOM_FULL when the room filled up meanwhile', () => {
    const room = mkRoom('alice');
    const v = svc.send(U.alice, 'bob', room.roomId);
    for (let i = room.users.size; i < config.MAX_USERS_PER_ROOM; i++) room.users.set(`fill-${i}`, { userId: `fill-${i}`, slot: null });
    expect(code(() => svc.accept(U.bob, v.id))).toBe('ROOM_FULL');
  });

  it('INVITE_GONE (and the invite is dropped) when the inviter has left the room', () => {
    const room = mkRoom('alice');
    join('carol', room);
    const v = svc.send(U.alice, 'bob', room.roomId);
    roomManager.leaveRoom(U.alice); // carol inherits the room
    expect(roomManager.getRoom(room.roomId)).toBeTruthy();
    expect(code(() => svc.accept(U.bob, v.id))).toBe('INVITE_GONE');
    expect(invites('bob')).toHaveLength(0);
  });

  it('an invite expires after TTL_MS and takes its notification with it', () => {
    const v = svc.send(U.alice, 'bob', mkRoom('alice').roomId);
    jest.advanceTimersByTime(svc.TTL_MS + 1);
    expect(code(() => svc.accept(U.bob, v.id))).toBe('INVITE_GONE');
    expect(invites('bob')).toHaveLength(0);
  });
});

describe('close (decline / cancel)', () => {
  it('invitee declines: invite and notification gone; idempotent', () => {
    const v = svc.send(U.alice, 'bob', mkRoom('alice').roomId);
    svc.close(U.bob, v.id);
    expect(invites('bob')).toHaveLength(0);
    expect(code(() => svc.accept(U.bob, v.id))).toBe('INVITE_GONE');
    expect(code(() => svc.close(U.bob, v.id))).toBeNull();
  });

  it('declining tells the inviter (room_invite_declined, once); cancelling or expiring does not', () => {
    const room = mkRoom('alice');
    const declined = () => notif.list(U.alice, 50).items.filter((n) => n.type === 'room_invite_declined');
    const a = svc.send(U.alice, 'bob', room.roomId);
    svc.close(U.bob, a.id);
    svc.close(U.bob, a.id); // idempotent: no second notice
    expect(declined()).toHaveLength(1);
    expect(declined()[0].payload).toMatchObject({ roomId: room.roomId, roomName: room.roomName, from: { username: 'bob', displayName: 'BOB' } });
    const b = svc.send(U.alice, 'carol', room.roomId);
    svc.close(U.alice, b.id); // sender cancels
    svc.send(U.alice, 'dave', room.roomId);
    jest.advanceTimersByTime(svc.TTL_MS + 1); // expiry
    expect(declined()).toHaveLength(1);
  });

  it('sender may cancel; a third party may not (NOT_YOUR_INVITE)', () => {
    const room = mkRoom('alice');
    const v = svc.send(U.alice, 'bob', room.roomId);
    expect(code(() => svc.close(U.carol, v.id))).toBe('NOT_YOUR_INVITE');
    svc.close(U.alice, v.id);
    expect(invites('bob')).toHaveLength(0);
  });
});

describe('purgeStale (server boot)', () => {
  it('deletes every room_invite notification and leaves other types alone', () => {
    const room = mkRoom('alice');
    svc.send(U.alice, 'bob', room.roomId);
    notif.push(U.bob, 'friend_request', U.carol, {});
    svc.purgeStale();
    expect(invites('bob')).toHaveLength(0);
    expect(notif.list(U.bob, 50).items.map((n) => n.type)).toEqual(['friend_request']);
  });
});

describe('onlineCandidates', () => {
  it('is host-only: a non-host member and someone in no room get NOT_HOST', () => {
    const room = mkRoom('alice');
    join('carol', room);
    expect(code(() => svc.onlineCandidates(U.carol))).toBe('NOT_HOST');
    expect(code(() => svc.onlineCandidates(U.dave))).toBe('NOT_HOST');
    expect(code(() => svc.onlineCandidates(U.alice))).toBeNull();
  });

  it('lists visibly-online members the host may invite, uncapped; excludes self, guests, people in rooms, privacy-blocked, unknown ids', () => {
    mkRoom('alice');
    addUser('inroom'); mkRoom('inroom', '7.7.7.7');
    addUser('blocked');
    db.prepare("UPDATE users SET who_can_challenge = 'nobody' WHERE id = ?").run(U.blocked);
    const many = [];
    for (let i = 0; i < 120; i++) { addUser(`m${i}`); many.push(U[`m${i}`]); }
    svc.setHooks({
      onlineUsers: () => [U.alice, U.bob, U.inroom, U.blocked, 'ghost-id', ...many]
        .map((userId) => ({ userId, isGuest: false })).concat([{ userId: 'guest_x', isGuest: true }]),
    });
    const out = svc.onlineCandidates(U.alice);
    const names = out.map((p) => p.username);
    expect(out).toHaveLength(121); // bob + 120, nobody else
    expect(names).toContain('bob');
    for (const bad of ['alice', 'inroom', 'blocked']) expect(names).not.toContain(bad);
    expect(out[0]).toEqual({ userId: expect.any(String), username: expect.any(String), displayName: expect.any(String), avatarUrl: null });
  });
});
