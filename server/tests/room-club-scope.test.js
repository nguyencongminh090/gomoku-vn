'use strict';

/**
 * room-club-scope.test.js — F453 Create Room player scope "Club members": only the creator's club mates
 * (membership read at join) or invitees of an eligible inviter may take a seat; everyone may watch.
 * Real SQL on an in-memory DB, real RoomManager + club-ids-lookup + RoomInviteService.
 */

jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const database = require('../db/database');
const notif = require('../managers/NotificationService');
const roomManager = require('../managers/RoomManager');
const { clubIdsOf } = require('../managers/club-ids-lookup');
const invites = require('../managers/RoomInviteService');

const NOW = '2026-11-25T00:00:00.000Z';
const db = database.db;
const U = {};

function addUser(name) {
  const id = `${name}-id`;
  U[name] = id;
  db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`)
    .run(id, name, name.toUpperCase(), NOW);
}
function addClub(id, owner) {
  db.prepare('INSERT INTO clubs (id, slug, name, owner_id, created_at) VALUES (?, ?, ?, ?, ?)').run(id, id, id, U[owner], NOW);
}
function member(club, name, role = 'member') {
  db.prepare('INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(club, U[name], role, NOW);
}

const create = (as, scope, extra = {}) =>
  roomManager.createRoom({ userId: U[as] || as, displayName: as.toUpperCase(), isGuest: !U[as], ip: null }, { playerScope: scope, ...extra });
const join = (as, room) => roomManager.joinRoom({ userId: U[as] || as, displayName: as.toUpperCase(), isGuest: !U[as] }, room.roomId);
const sit = (as, slot) => roomManager.sitDown(U[as] || as, slot);
const entry = (room, as) => room.users.get(U[as] || as);

let roomChanged;

beforeAll(() => {
  for (const n of ['alice', 'bob', 'carol', 'dave', 'erin', 'pend']) addUser(n);
  addClub('c1', 'alice');
  addClub('c2', 'carol');
  member('c1', 'alice', 'owner');
  member('c1', 'bob');
  member('c2', 'carol', 'owner');
  member('c1', 'pend', 'pending');
});

beforeEach(() => {
  roomManager.rooms.clear();
  roomManager.userRoomMap.clear();
  roomManager.clubIdsOf = clubIdsOf;
  invites._reset();
  db.prepare('DELETE FROM notifications').run();
  db.prepare("UPDATE users SET who_can_challenge = 'everyone'").run();
  notif.setEmitter(() => {});
  roomChanged = jest.fn();
  invites.setHooks({ onlineUsers: () => [], onRoomChanged: roomChanged });
});

afterAll(() => { delete roomManager.clubIdsOf; });

describe('createRoom: scope', () => {
  it.each([
    ['member with a club asks clubs', 'alice', 'clubs', 'clubs'],
    ['clubless member asks clubs', 'dave', 'clubs', 'all'],
    ['pending-only applicant asks clubs', 'pend', 'clubs', 'all'],
    ['guest asks clubs', 'guest-x', 'clubs', 'all'],
    ['member asks all', 'alice', 'all', 'all'],
    ['no / unknown scope', 'alice', 'bogus', 'all'],
  ])('%s → %s', (_label, as, asked, expected) => {
    const { room } = create(as, asked);
    expect(room.playerScope).toBe(expected);
  });

  it('snapshots the creator\'s club ids (pending ones excluded)', () => {
    member('c2', 'erin');
    const { room } = create('erin', 'clubs');
    expect([...room.clubIds]).toEqual(['c2']);
    db.prepare("DELETE FROM club_members WHERE user_id = ?").run(U.erin);
  });

  it('no lookup wired (tests, scripts, other callers) → all', () => {
    delete roomManager.clubIdsOf;
    expect(create('alice', 'clubs').room.playerScope).toBe('all');
  });

  it('scope is not a setting: updateSettings cannot change it', () => {
    const { room } = create('alice', 'clubs');
    expect(room.settings.playerScope).toBeUndefined();
    const r = roomManager.updateSettings(U.alice, { playerScope: 'all', boardSize: 15 });
    expect(r.error).toBeUndefined();
    expect(room.playerScope).toBe('clubs');
    expect(room.settings.playerScope).toBeUndefined();
  });
});

describe('sitDown in a clubs room', () => {
  it('creator sits; a club mate sits; outsider, guest and pending applicant get SEAT_CLUB_ONLY', () => {
    const { room } = create('alice', 'clubs');
    for (const n of ['bob', 'carol', 'pend', 'guest-y']) join(n, room);
    expect(sit('alice', 1).error).toBeUndefined();
    expect(sit('bob', 2).error).toBeUndefined();
    roomManager.standUp(U.bob);
    for (const n of ['carol', 'pend', 'guest-y']) {
      expect(sit(n, 2).code).toBe('SEAT_CLUB_ONLY');
      expect(entry(room, n).slot).toBeNull();
    }
  });

  it('membership is read at join: someone who joins the club after the room was made may sit', () => {
    const { room } = create('alice', 'clubs');
    member('c1', 'dave');
    join('dave', room);
    expect(sit('dave', 1).error).toBeUndefined();
    db.prepare("DELETE FROM club_members WHERE user_id = ?").run(U.dave);
  });

  it('an all room seats anyone', () => {
    const { room } = create('alice', 'all');
    join('carol', room);
    expect(sit('carol', 1).error).toBeUndefined();
  });

  it('host transfer does not widen access: an outsider who becomes host still cannot sit', () => {
    const { room } = create('alice', 'clubs');
    join('carol', room);
    roomManager.leaveRoom(U.alice);
    expect(room.host).toBe(U.carol);
    expect(sit('carol', 1).code).toBe('SEAT_CLUB_ONLY');
  });
});

describe('invites in a clubs room', () => {
  const inviteAndAccept = (from, to, room) => {
    const v = invites.send(U[from], to, room.roomId);
    return invites.accept(U[to], v.id);
  };

  it('invited outsider (accepts before joining) may sit', () => {
    const { room } = create('alice', 'clubs');
    expect(inviteAndAccept('alice', 'carol', room)).toEqual({ roomId: room.roomId });
    join('carol', room);
    expect(entry(room, 'carol').canSit).toBe(true);
    expect(sit('carol', 1).error).toBeUndefined();
    expect(roomChanged).not.toHaveBeenCalled(); // carol was not in the room yet: her join broadcasts
  });

  it('a viewer already inside is unlocked at once and the room is re-broadcast', () => {
    const { room } = create('alice', 'clubs');
    join('carol', room);
    expect(entry(room, 'carol').canSit).toBe(false);
    inviteAndAccept('alice', 'carol', room);
    expect(entry(room, 'carol').canSit).toBe(true);
    expect(roomChanged).toHaveBeenCalledWith(room);
    expect(sit('carol', 2).error).toBeUndefined();
  });

  it('an ineligible host\'s invite grants nothing', () => {
    const { room } = create('alice', 'clubs');
    join('carol', room);
    roomManager.leaveRoom(U.alice); // carol (outsider) becomes host
    inviteAndAccept('carol', 'dave', room);
    join('dave', room);
    expect(sit('dave', 1).code).toBe('SEAT_CLUB_ONLY');
    expect(room.invitedIds.has(U.dave)).toBe(false);
    expect(roomChanged).not.toHaveBeenCalled();
  });

  it('kick revokes the grant: the kicked invitee rejoins as a locked viewer', () => {
    const { room } = create('alice', 'clubs');
    inviteAndAccept('alice', 'carol', room);
    join('carol', room);
    expect(roomManager.kickUser(U.alice, U.carol).kicked).toBe(true);
    expect(room.invitedIds.has(U.carol)).toBe(false);
    join('carol', room);
    expect(sit('carol', 1).code).toBe('SEAT_CLUB_ONLY');
  });

  it('an invite in an all room records nothing', () => {
    const { room } = create('alice', 'all');
    inviteAndAccept('alice', 'carol', room);
    expect(room.invitedIds.size).toBe(0);
  });
});

describe('payloads', () => {
  it('clubs room: per-user canSit in serializeRoom users and scope on the lobby entry', () => {
    const { room } = create('alice', 'clubs');
    join('bob', room);
    join('carol', room);
    const users = Object.fromEntries(roomManager.serializeRoom(room).users.map((u) => [u.userId, u.canSit]));
    expect(users).toEqual({ [U.alice]: true, [U.bob]: true, [U.carol]: false });
    expect(roomManager.lobbyEntry(room).scope).toBe('clubs');
  });

  it('all room: payloads carry neither field', () => {
    const { room } = create('alice', 'all');
    join('carol', room);
    for (const u of roomManager.serializeRoom(room).users) expect(u).not.toHaveProperty('canSit');
    expect(roomManager.lobbyEntry(room)).not.toHaveProperty('scope');
  });
});
