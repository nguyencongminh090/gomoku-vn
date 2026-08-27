'use strict';

/**
 * RoomManager.test.js — Unit tests for RoomManager.
 *
 * Covers the idle-scan interval (cadence comes from config, and the interval
 * actually drives _idleCleanup) and the per-IP room quota, including that
 * quota being freed again by every path that destroys a room.
 *
 * config is mocked with a SENTINEL scan interval deliberately different from
 * the real 60_000. Asserting against the real value would pass even with the
 * old hard-coded literal still in place — the sentinel is what makes this a
 * real regression guard rather than a tautology.
 *
 * Fake timers are installed before requiring RoomManager, because its
 * constructor starts the cleanup interval at require time (it is a singleton).
 */

jest.useFakeTimers();

const SENTINEL_SCAN_MS = 12_345;

jest.mock('../config', () => ({
  ...jest.requireActual('../config'),
  IDLE_SCAN_INTERVAL_MS: 12_345,
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const fs = require('fs');
const path = require('path');

const setIntervalSpy = jest.spyOn(global, 'setInterval');

const realConfig = jest.requireActual('../config');
const roomManager = require('../managers/RoomManager');

describe('RoomManager — idle scan cadence', () => {
  test('the cleanup interval is scheduled from config, not a literal', () => {
    expect(setIntervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      SENTINEL_SCAN_MS
    );
  });

  test('each elapsed interval triggers exactly one idle sweep', () => {
    const sweep = jest.spyOn(roomManager, '_idleCleanup').mockImplementation(() => {});
    try {
      jest.advanceTimersByTime(SENTINEL_SCAN_MS - 1);
      expect(sweep).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(sweep).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(SENTINEL_SCAN_MS * 3);
      expect(sweep).toHaveBeenCalledTimes(4);
    } finally {
      sweep.mockRestore();
    }
  });
});

// ── Default room name ────────────────────────────────────────────────────

describe('RoomManager — default room name', () => {
  let seq = 0;

  function user() {
    seq++;
    return { userId: `dn-u${seq}`, displayName: `User${seq}`, isGuest: false };
  }

  beforeEach(() => {
    for (const [roomId] of [...roomManager.rooms]) roomManager._destroyRoom(roomId);
    roomManager.rooms.clear();
    roomManager.userRoomMap.clear();
  });

  test('with no custom roomName, the default is "#<roomId>", not the host name', () => {
    const { room } = roomManager.createRoom(user());
    expect(room.roomName).toBe(`#${room.roomId}`);
  });

  test('a custom roomName is kept as-is, not overridden by the default', () => {
    const { room } = roomManager.createRoom(user(), { roomName: 'Tên tuỳ chỉnh' });
    expect(room.roomName).toBe('Tên tuỳ chỉnh');
  });
});

// ── Per-IP room quota ──────────────────────────────────────────────────────

describe('RoomManager — per-IP room quota', () => {
  const IP_A = '203.0.113.10';
  const IP_B = '203.0.113.99';
  let seq = 0;

  /** Fresh user each call, so the one-room-per-user rule never masks a result. */
  function user(ip) {
    seq++;
    return { userId: `u${seq}`, displayName: `User${seq}`, isGuest: false, ip };
  }

  function createN(n, ip) {
    const results = [];
    for (let i = 0; i < n; i++) results.push(roomManager.createRoom(user(ip)));
    return results;
  }

  beforeEach(() => {
    for (const [roomId] of [...roomManager.rooms]) roomManager._destroyRoom(roomId);
    roomManager.rooms.clear();
    roomManager.userRoomMap.clear();
  });

  test('an IP may create up to MAX_ROOMS_PER_IP rooms', () => {
    const results = createN(realConfig.MAX_ROOMS_PER_IP, IP_A);
    expect(results.every(r => r.room)).toBe(true);
    expect(roomManager.rooms.size).toBe(realConfig.MAX_ROOMS_PER_IP);
  });

  test('the next room from the same IP is refused with a message, not a crash', () => {
    createN(realConfig.MAX_ROOMS_PER_IP, IP_A);

    const over = roomManager.createRoom(user(IP_A));
    expect(over.room).toBeUndefined();
    expect(typeof over.error).toBe('string');
    expect(roomManager.rooms.size).toBe(realConfig.MAX_ROOMS_PER_IP);
  });

  test('a different IP is unaffected by another IP hitting its quota', () => {
    createN(realConfig.MAX_ROOMS_PER_IP, IP_A);

    const other = roomManager.createRoom(user(IP_B));
    expect(other.room).toBeDefined();
  });

  test('the quota is above 1, so users sharing a NAT/wifi IP are not locked out', () => {
    // A limit of 1 would refuse the second person on the same office or mobile
    // carrier IP — a real user who did nothing wrong.
    expect(realConfig.MAX_ROOMS_PER_IP).toBeGreaterThan(1);
    expect(realConfig.MAX_ROOMS_PER_IP).toBeLessThan(realConfig.MAX_ROOMS);
  });

  test('a connection with no known IP is not quota-limited', () => {
    // Never refuse a real user because the address was unavailable.
    const results = createN(realConfig.MAX_ROOMS_PER_IP + 2, undefined);
    expect(results.every(r => r.room)).toBe(true);
  });

  // ── Quota release: every path that destroys a room must free its slot ─────

  test('quota is freed when the last user leaves (explicit close path)', () => {
    const first = createN(realConfig.MAX_ROOMS_PER_IP, IP_A)[0];
    expect(roomManager.createRoom(user(IP_A)).error).toBeTruthy();

    // Last (only) user leaves → leaveRoom destroys the room.
    const left = roomManager.leaveRoom(first.room.host);
    expect(left.destroyed).toBe(true);

    expect(roomManager.createRoom(user(IP_A)).room).toBeDefined();
  });

  test('quota is freed by idle cleanup (timeout path)', () => {
    createN(realConfig.MAX_ROOMS_PER_IP, IP_A);
    expect(roomManager.createRoom(user(IP_A)).error).toBeTruthy();

    // Age every room past the idle timeout, then run the sweep for real.
    for (const [, room] of roomManager.rooms) {
      room.lastActivity = Date.now() - realConfig.IDLE_TIMEOUT_MS - 1;
    }
    roomManager._idleCleanup();
    expect(roomManager.rooms.size).toBe(0);

    expect(roomManager.createRoom(user(IP_A)).room).toBeDefined();
  });

  test('quota is freed by _destroyRoom directly (any future teardown path)', () => {
    const rooms = createN(realConfig.MAX_ROOMS_PER_IP, IP_A);
    expect(roomManager.createRoom(user(IP_A)).error).toBeTruthy();

    roomManager._destroyRoom(rooms[0].room.roomId);

    expect(roomManager.createRoom(user(IP_A)).room).toBeDefined();
  });

  test('the count is derived from live rooms, so it cannot drift out of sync', () => {
    // Deleting a room straight out of the map — simulating a teardown path
    // that never learned about the quota — still frees the slot, because
    // nothing is tallied separately.
    const rooms = createN(realConfig.MAX_ROOMS_PER_IP, IP_A);
    roomManager.rooms.delete(rooms[0].room.roomId);

    expect(roomManager.createRoom(user(IP_A)).room).toBeDefined();
  });

  // ── The creator's IP must not reach clients ──────────────────────────────

  test('creatorIp is not exposed by serializeRoom or listRooms', () => {
    const { room } = roomManager.createRoom(user(IP_A));
    expect(room.creatorIp).toBe(IP_A);

    const serialized = roomManager.serializeRoom(room);
    expect(serialized).not.toHaveProperty('creatorIp');
    expect(JSON.stringify(serialized)).not.toContain(IP_A);

    const listed = roomManager.listRooms();
    expect(JSON.stringify(listed)).not.toContain(IP_A);
  });
});

// ── Per-IP quota exemption for empty-room-grace rooms (TODO.md #43) ────────
// A room whose sole occupant just disconnected sits alive in `this.rooms`
// for EMPTY_ROOM_GRACE_MS so they can reconnect, but is abandoned in every
// practical sense — createRoom's 3rd param (graceRoomIds) lets the caller
// exclude such rooms from the main MAX_ROOMS_PER_IP count, while a separate
// MAX_GRACE_ROOMS_PER_IP still bounds them so the exemption can't become an
// unlimited bypass (repeatedly create-then-disconnect to hoard "near-alive"
// rooms). See instruction.md §43.

describe('RoomManager — per-IP quota exemption for empty-room-grace rooms', () => {
  const IP_A = '203.0.113.20';
  let seq = 0;

  function user(ip) {
    seq++;
    return { userId: `grace-u${seq}`, displayName: `GraceUser${seq}`, isGuest: false, ip };
  }

  beforeEach(() => {
    for (const [roomId] of [...roomManager.rooms]) roomManager._destroyRoom(roomId);
    roomManager.rooms.clear();
    roomManager.userRoomMap.clear();
  });

  test('a room sitting in grace is not counted toward MAX_ROOMS_PER_IP for a fresh room from the same IP', () => {
    // Fill the active quota, then mark only the FIRST of those rooms as "in
    // grace" (mirrors LobbyHandler.js collecting emptyRoomGraceTimers'
    // roomIds) — leaving the other MAX_ROOMS_PER_IP - 1 genuinely active.
    // (Marking all of them in-grace at once would itself trip
    // MAX_GRACE_ROOMS_PER_IP, which defaults to the same value as
    // MAX_ROOMS_PER_IP — that combined scenario is covered by the
    // MAX_GRACE_ROOMS_PER_IP test below instead.)
    const rooms = [];
    for (let i = 0; i < realConfig.MAX_ROOMS_PER_IP; i++) {
      rooms.push(roomManager.createRoom(user(IP_A)).room);
    }
    const graceRoomIds = new Set([rooms[0].roomId]);

    // Without the grace set, this would be refused (matches the pre-#43
    // "the next room from the same IP is refused" test above) — active
    // count would be the full MAX_ROOMS_PER_IP.
    expect(roomManager.createRoom(user(IP_A)).error).toBeTruthy();

    // With the first room recognized as in-grace, active count drops to
    // MAX_ROOMS_PER_IP - 1, so a fresh one is allowed.
    const result = roomManager.createRoom(user(IP_A), {}, graceRoomIds);
    expect(result.room).toBeDefined();
    expect(roomManager.rooms.size).toBe(realConfig.MAX_ROOMS_PER_IP + 1);
  });

  test('only the rooms actually in graceRoomIds are exempted — a mixed active+grace IP still gets refused at MAX_ROOMS_PER_IP active', () => {
    const rooms = [];
    for (let i = 0; i < realConfig.MAX_ROOMS_PER_IP; i++) {
      rooms.push(roomManager.createRoom(user(IP_A)).room);
    }
    // Only exempt ONE of the MAX_ROOMS_PER_IP rooms — the other
    // (MAX_ROOMS_PER_IP - 1) are still "active" and already at the cap
    // minus one, so this one exemption should be exactly enough to allow
    // exactly one more room, not unlimited more.
    const graceRoomIds = new Set([rooms[0].roomId]);

    expect(roomManager.createRoom(user(IP_A), {}, graceRoomIds).room).toBeDefined();
    // The slot opened by the one exemption is now used up (that new room
    // is itself "active" and not in graceRoomIds) — the next one is refused.
    expect(roomManager.createRoom(user(IP_A), {}, graceRoomIds).error).toBeTruthy();
  });

  test('grace rooms are still bounded by MAX_GRACE_ROOMS_PER_IP — exemption cannot become an unlimited bypass', () => {
    // Simulate the create-then-disconnect abuse loop instruction.md §43 warns
    // against: every room created from this IP immediately becomes
    // "in grace" (as if its sole occupant disconnected right away).
    const graceRoomIds = new Set();
    const results = [];
    for (let i = 0; i < realConfig.MAX_GRACE_ROOMS_PER_IP; i++) {
      const result = roomManager.createRoom(user(IP_A), {}, graceRoomIds);
      results.push(result);
      expect(result.room).toBeDefined();
      graceRoomIds.add(result.room.roomId);
    }
    expect(roomManager.rooms.size).toBe(realConfig.MAX_GRACE_ROOMS_PER_IP);

    // One more, still with every prior room recognized as in-grace (so the
    // active-quota check alone would allow it) — MAX_GRACE_ROOMS_PER_IP
    // must refuse it instead.
    const over = roomManager.createRoom(user(IP_A), {}, graceRoomIds);
    expect(over.room).toBeUndefined();
    expect(typeof over.error).toBe('string');
    expect(roomManager.rooms.size).toBe(realConfig.MAX_GRACE_ROOMS_PER_IP);
  });

  test('a graceRoomIds entry for a different IP\'s room does not exempt this IP\'s own rooms', () => {
    const IP_B = '203.0.113.21';
    const otherRoom = roomManager.createRoom(user(IP_B)).room;
    for (let i = 0; i < realConfig.MAX_ROOMS_PER_IP; i++) roomManager.createRoom(user(IP_A));

    const graceRoomIds = new Set([otherRoom.roomId]); // belongs to IP_B, not IP_A
    expect(roomManager.createRoom(user(IP_A), {}, graceRoomIds).error).toBeTruthy();
  });

  test('omitting graceRoomIds behaves exactly as before #43 (no exemptions)', () => {
    for (let i = 0; i < realConfig.MAX_ROOMS_PER_IP; i++) roomManager.createRoom(user(IP_A));
    expect(roomManager.createRoom(user(IP_A)).error).toBeTruthy();
  });
});

// ── Total room cap (MAX_ROOMS) ──────────────────────────────────────────────
// Previously untested: the per-IP quota above had thorough coverage, but the
// site-wide MAX_ROOMS cap it sits alongside (server/managers/RoomManager.js,
// createRoom's very first check) had none. Spreads rooms across enough unique
// IPs to hit MAX_ROOMS without tripping MAX_ROOMS_PER_IP first, so this tests
// the cap this describe block is actually about.

describe('RoomManager — total room cap (MAX_ROOMS)', () => {
  let seq = 0;

  function user(ip) {
    seq++;
    return { userId: `cap-u${seq}`, displayName: `CapUser${seq}`, isGuest: false, ip };
  }

  /** A fresh, never-before-used IP for every call, so MAX_ROOMS_PER_IP is never the blocker here. */
  function freshIp() {
    seq++;
    return `198.51.100.${seq}`;
  }

  /** Fill the room pool to exactly `count`, spreading across as many unique IPs as needed. */
  function fillRooms(count) {
    const results = [];
    let ip = freshIp();
    let fromThisIp = 0;
    for (let i = 0; i < count; i++) {
      if (fromThisIp >= realConfig.MAX_ROOMS_PER_IP) {
        ip = freshIp();
        fromThisIp = 0;
      }
      results.push(roomManager.createRoom(user(ip)));
      fromThisIp++;
    }
    return results;
  }

  beforeEach(() => {
    for (const [roomId] of [...roomManager.rooms]) roomManager._destroyRoom(roomId);
    roomManager.rooms.clear();
    roomManager.userRoomMap.clear();
  });

  test('exactly MAX_ROOMS rooms can be created, all from distinct IPs', () => {
    const results = fillRooms(realConfig.MAX_ROOMS);
    expect(results.every(r => r.room)).toBe(true);
    expect(roomManager.rooms.size).toBe(realConfig.MAX_ROOMS);
  });

  test('the room after MAX_ROOMS is refused with a message, not a crash, even from a brand-new IP', () => {
    fillRooms(realConfig.MAX_ROOMS);

    const over = roomManager.createRoom(user(freshIp()));
    expect(over.room).toBeUndefined();
    expect(typeof over.error).toBe('string');
    expect(roomManager.rooms.size).toBe(realConfig.MAX_ROOMS);
  });

  test('destroying one room frees a slot for a new one', () => {
    const rooms = fillRooms(realConfig.MAX_ROOMS);
    expect(roomManager.createRoom(user(freshIp())).error).toBeTruthy();

    roomManager._destroyRoom(rooms[0].room.roomId);

    expect(roomManager.createRoom(user(freshIp())).room).toBeDefined();
  });
});

// ── room:updated payload ───────────────────────────────────────────────────

describe('RoomManager — serializeRoomUpdate', () => {
  function makeRoom() {
    const { room } = roomManager.createRoom({
      userId: 'host-1', displayName: 'Host', isGuest: false, ip: '198.51.100.7',
    });
    return room;
  }

  beforeEach(() => {
    for (const [roomId] of [...roomManager.rooms]) roomManager._destroyRoom(roomId);
    roomManager.rooms.clear();
    roomManager.userRoomMap.clear();
  });

  test('omits settings', () => {
    const update = roomManager.serializeRoomUpdate(makeRoom());
    expect(update).not.toHaveProperty('settings');
  });

  test('is otherwise identical to the full room:joined snapshot', () => {
    const room = makeRoom();
    const full = roomManager.serializeRoom(room);
    const update = roomManager.serializeRoomUpdate(room);

    const { settings, ...fullWithoutSettings } = full;
    expect(update).toEqual(fullWithoutSettings);
    // Everything the room screen re-renders on each update is still present.
    expect(update.users).toBeDefined();
    expect(update.state).toBeDefined();
    expect(update.scoreTable).toBeDefined();
    expect(update.hostId).toBeDefined();
    expect(update.readyDeadline !== undefined).toBe(true);
  });

  test('does not mutate the room, so the next room:joined still has settings', () => {
    const room = makeRoom();
    roomManager.serializeRoomUpdate(room);

    expect(room.settings).toBeDefined();
    expect(roomManager.serializeRoom(room).settings).toBeDefined();
  });

  test('measurably smaller than the full snapshot', () => {
    const room = makeRoom();
    const fullSize = JSON.stringify(roomManager.serializeRoom(room)).length;
    const updateSize = JSON.stringify(roomManager.serializeRoomUpdate(room)).length;

    expect(updateSize).toBeLessThan(fullSize);
  });
});

describe('every room:updated emit site', () => {
  // The review counted 17 emit sites and warned that missing one leaves the
  // old payload in place. A source-level sweep is the only way to guard that:
  // a behavioural test only covers the paths it happens to exercise.
  //
  // Since the room:updated O(n²) delta fix (see state.js's broadcastRoomUpdate
  // and docs/fix-log.md), every one of those sites goes through the shared
  // broadcastRoomUpdate(io, room[, opts]) helper instead of emitting directly
  // — mirroring the same "call sites can't describe the change, only that
  // something changed" shape already used for lobby:patch. The direct
  // `.emit('room:updated', ...)` should now exist in exactly one place: inside
  // broadcastRoomUpdate itself.
  //
  // Count dropped 17 → 15 when TODO.md #36 removed the game:rematch handler
  // (GameHandler.js): it had 2 of its own broadcastRoomUpdate call sites
  // (allReady / not-allReady branches), now folded into the same room:ready
  // flow (RoomHandler.js) that a first game start already used.
  //
  // Count rose 15 → 21 with the slot-status presence feature (green/gray/
  // red/orange dots): a new room:presence handler (RoomHandler.js) plus 5
  // more broadcasts so presence changes ('disconnected' at each grace start,
  // 'active' at each reconnect path) actually reach other room members —
  // SocketHandler.js's plain reconnect, DisconnectHandler.js's
  // startEmptyRoomGrace/startSpectatorGrace/startDisconnectGrace, and the
  // cancelDisconnectGrace "other player still away" branch.
  const SOCKET_DIR = path.join(__dirname, '..', 'socket');

  function jsFilesUnder(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...jsFilesUnder(full));
      else if (entry.name.endsWith('.js')) out.push(full);
    }
    return out;
  }

  const emitSites = [];
  const callSites = [];
  for (const file of jsFilesUnder(SOCKET_DIR)) {
    const src = fs.readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (line.includes("emit('room:updated'")) {
        emitSites.push({ file: path.relative(SOCKET_DIR, file), line: i + 1, text: line.trim() });
      }
      // Exclude the function's own declaration line and the destructured
      // import lines — only lines that actually invoke it with an `io` arg.
      if (/broadcastRoomUpdate\(io\b/.test(line) && !/^function /.test(line.trim())) {
        callSites.push({ file: path.relative(SOCKET_DIR, file), line: i + 1, text: line.trim() });
      }
    });
  }

  test('the raw room:updated emit exists in exactly one place: inside broadcastRoomUpdate', () => {
    expect(emitSites).toHaveLength(1);
    expect(emitSites[0].file).toBe('state.js');
  });

  test('all 22 sites are still accounted for, now via broadcastRoomUpdate', () => {
    expect(callSites).toHaveLength(22);
  });

  test('passes { settings: true } at exactly the one settings-change site', () => {
    const withSettings = callSites.filter(s => /settings:\s*true/.test(s.text));

    expect(withSettings).toHaveLength(1);
    expect(withSettings[0].file).toBe(path.join('handlers', 'RoomHandler.js'));

    expect(callSites.length - withSettings.length).toBe(21);
  });
});

// ── Kick guard during an interrupted game (restores the test discarded when
//    backend fix #6 was made — see docs/fix-log.md) ─────────────────────────

describe('RoomManager — kickUser while a game is interrupted', () => {
  beforeEach(() => {
    for (const [roomId] of [...roomManager.rooms]) roomManager._destroyRoom(roomId);
    roomManager.rooms.clear();
    roomManager.userRoomMap.clear();
  });

  function roomWithTwo() {
    const { room } = roomManager.createRoom(
      { userId: 'host', displayName: 'Host', isGuest: false, ip: '198.51.100.1' }
    );
    roomManager.joinRoom(
      { userId: 'guest', displayName: 'Guest', isGuest: true }, room.roomId
    );
    return room;
  }

  test('a host cannot kick anyone while the room is interrupted', () => {
    // The exact scenario from fix #6: without this guard, kicking a player who
    // was mid-game but disconnected removed them from room.users, and the
    // grace timer then had nobody to restore — the room stuck in 'interrupted'
    // forever, which _idleCleanup deliberately skips.
    const room = roomWithTwo();
    room.state = 'interrupted';

    const result = roomManager.kickUser('host', 'guest');

    expect(result.error).toBeTruthy();
    expect(room.users.has('guest')).toBe(true);
  });

  test('a host cannot kick while the room is playing either', () => {
    const room = roomWithTwo();
    room.state = 'playing';

    expect(roomManager.kickUser('host', 'guest').error).toBeTruthy();
    expect(room.users.has('guest')).toBe(true);
  });

  test('kicking still works in an idle room', () => {
    const room = roomWithTwo();
    expect(room.state).toBe('idle');

    const result = roomManager.kickUser('host', 'guest');

    expect(result.error).toBeUndefined();
    expect(room.users.has('guest')).toBe(false);
  });
});

describe('RoomManager — setPresence (slot status dots)', () => {
  beforeEach(() => {
    for (const [roomId] of [...roomManager.rooms]) roomManager._destroyRoom(roomId);
    roomManager.rooms.clear();
    roomManager.userRoomMap.clear();
  });

  function roomWithOne() {
    const { room } = roomManager.createRoom(
      { userId: 'host', displayName: 'Host', isGuest: false, ip: '198.51.100.1' }
    );
    return room;
  }

  test('a newly created room entry defaults to active presence', () => {
    const room = roomWithOne();
    expect(room.users.get('host').presence).toBe('active');
  });

  test('a newly joined room entry defaults to active presence', () => {
    const room = roomWithOne();
    roomManager.joinRoom({ userId: 'guest', displayName: 'Guest', isGuest: true }, room.roomId);
    expect(room.users.get('guest').presence).toBe('active');
  });

  test('reports away when the client says the tab went hidden', () => {
    const room = roomWithOne();
    const result = roomManager.setPresence('host', 'away');

    expect(result.error).toBeUndefined();
    expect(room.users.get('host').presence).toBe('away');
  });

  test('reports back to active when the tab becomes visible again', () => {
    const room = roomWithOne();
    roomManager.setPresence('host', 'away');

    roomManager.setPresence('host', 'active');

    expect(room.users.get('host').presence).toBe('active');
  });

  test('an unrecognized presence value falls back to active rather than erroring', () => {
    // The socket handler passes payload.presence through largely unvalidated —
    // this is the defensive floor for a malformed/garbage client payload.
    const room = roomWithOne();
    const result = roomManager.setPresence('host', 'not-a-real-state');

    expect(result.error).toBeUndefined();
    expect(room.users.get('host').presence).toBe('active');
  });

  test('a user not in any room reports NOT_IN_ROOM instead of throwing', () => {
    const result = roomManager.setPresence('nobody', 'away');
    expect(result.error).toBeTruthy();
    expect(result.code).toBe('NOT_IN_ROOM');
  });

  test('server-authoritative disconnected presence cannot be overwritten by a client presence event', () => {
    // Guards the race this method exists to prevent: a stray/delayed
    // 'room:presence' event arriving from a socket that has since actually
    // dropped (grace period in progress) must not paper over the orange dot
    // with green/gray — DisconnectHandler.js owns clearing 'disconnected'.
    const room = roomWithOne();
    room.users.get('host').presence = 'disconnected';

    const result = roomManager.setPresence('host', 'active');

    expect(result.error).toBeUndefined();
    expect(room.users.get('host').presence).toBe('disconnected');
  });
});

describe('RoomManager — ready-window miss counting (TODO.md #36)', () => {
  beforeEach(() => {
    for (const [roomId] of [...roomManager.rooms]) roomManager._destroyRoom(roomId);
    roomManager.rooms.clear();
    roomManager.userRoomMap.clear();
  });

  function roomWithTwoSeated() {
    const { room } = roomManager.createRoom(
      { userId: 'host', displayName: 'Host', isGuest: false, ip: '198.51.100.20' }
    );
    roomManager.joinRoom(
      { userId: 'guest', displayName: 'Guest', isGuest: true }, room.roomId
    );
    roomManager.sitDown('host', 1);
    roomManager.sitDown('guest', 2);
    return room;
  }

  // ── confirmStart / handleReadyClick precondition ──────────────────────────

  test('confirmStart marks only the calling player ready; allReady stays false until both are', () => {
    const room = roomWithTwoSeated();

    const first = roomManager.confirmStart('host');
    expect(first.allReady).toBe(false);
    expect(room.users.get('host').ready).toBe(true);
    expect(room.users.get('guest').ready).toBe(false);

    const second = roomManager.confirmStart('guest');
    expect(second.allReady).toBe(true);
  });

  // ── registerReadyMiss: 3-strike rule ───────────────────────────────────────

  test('miss 1/3: neither seat is kicked, both reset to not-ready, count is 1', () => {
    const room = roomWithTwoSeated();
    roomManager.confirmStart('host'); // host clicked, guest never does

    const { kicked, missCount } = roomManager.registerReadyMiss(room.roomId);

    expect(kicked).toBeNull();
    expect(missCount).toBe(1);
    expect(room.readyMissCount).toBe(1);
    expect(room.users.get('host').ready).toBe(false);
    expect(room.users.get('guest').ready).toBe(false);
    // Nobody vacated their seat on a miss below 3.
    expect(room.users.get('host').slot).toBe(1);
    expect(room.users.get('guest').slot).toBe(2);
  });

  test('miss 2/3: still no kick, count accumulates across separate rounds', () => {
    const room = roomWithTwoSeated();

    roomManager.confirmStart('host');
    roomManager.registerReadyMiss(room.roomId); // miss 1

    roomManager.confirmStart('host'); // host clicks again for round 2
    const { kicked, missCount } = roomManager.registerReadyMiss(room.roomId);

    expect(kicked).toBeNull();
    expect(missCount).toBe(2);
    expect(room.users.get('host').slot).toBe(1);
    expect(room.users.get('guest').slot).toBe(2);
  });

  test('miss 3/3: exactly the player who never clicked is vacated; the clicker keeps their seat', () => {
    const room = roomWithTwoSeated();

    roomManager.confirmStart('host');
    roomManager.registerReadyMiss(room.roomId); // miss 1
    roomManager.confirmStart('host');
    roomManager.registerReadyMiss(room.roomId); // miss 2
    roomManager.confirmStart('host');
    const { kicked, missCount } = roomManager.registerReadyMiss(room.roomId); // miss 3

    expect(kicked).toEqual({ userId: 'guest', displayName: 'Guest' });
    expect(missCount).toBe(0); // resets after a kick — fresh pair once someone re-sits
    expect(room.readyMissCount).toBe(0);
    expect(room.users.get('guest').slot).toBeNull(); // vacated
    expect(room.users.get('host').slot).toBe(1);      // clicker keeps their seat
  });

  test('miss 3/3 kicks whichever seat is not-ready that round, not always the same one', () => {
    // Round 1 and 2: host clicks, guest misses. Round 3: guest clicks instead —
    // the 3rd miss must kick host (the one who did NOT click this round), not
    // guest just because guest missed rounds 1-2.
    const room = roomWithTwoSeated();

    roomManager.confirmStart('host');
    roomManager.registerReadyMiss(room.roomId); // miss 1
    roomManager.confirmStart('host');
    roomManager.registerReadyMiss(room.roomId); // miss 2
    roomManager.confirmStart('guest');
    const { kicked } = roomManager.registerReadyMiss(room.roomId); // miss 3

    expect(kicked).toEqual({ userId: 'host', displayName: 'Host' });
    expect(room.users.get('host').slot).toBeNull();
    expect(room.users.get('guest').slot).toBe(2);
  });

  // ── Reset on seat-occupancy change (instruction.md §B36) ──────────────────

  test('standing up mid-countdown resets the miss count to 0, not counted as a miss', () => {
    const room = roomWithTwoSeated();
    roomManager.confirmStart('host');
    roomManager.registerReadyMiss(room.roomId); // miss 1 — count is now 1

    roomManager.confirmStart('host'); // host re-clicks for round 2
    roomManager.standUp('guest');     // guest leaves the seat before the 15s elapses

    expect(room.readyMissCount).toBe(0);
    expect(room.users.get('host').ready).toBe(false); // baseline: neither flagged ready
  });

  test('a fresh occupant of a vacated seat starts a brand new pair (missCount 0, not stale-ready)', () => {
    const room = roomWithTwoSeated();
    roomManager.confirmStart('host');
    roomManager.registerReadyMiss(room.roomId); // miss 1
    roomManager.registerReadyMiss(room.roomId); // miss 2
    roomManager.standUp('guest');

    roomManager.joinRoom({ userId: 'newcomer', displayName: 'Newcomer', isGuest: true }, room.roomId);
    roomManager.sitDown('newcomer', 2);

    expect(room.readyMissCount).toBe(0);
    expect(room.users.get('host').ready).toBe(false);
    expect(room.users.get('newcomer').ready).toBe(false);
  });

  test('kicking a seated player resets the pair; kicking a spectator does not touch it', () => {
    const room = roomWithTwoSeated();
    roomManager.confirmStart('host');
    roomManager.registerReadyMiss(room.roomId); // miss 1
    expect(room.readyMissCount).toBe(1);

    roomManager.joinRoom({ userId: 'spectator', displayName: 'Spec', isGuest: true }, room.roomId);
    roomManager.kickUser('host', 'spectator'); // not seated — must not reset the pair
    expect(room.readyMissCount).toBe(1);

    roomManager.kickUser('host', 'guest'); // seated — resets the pair
    expect(room.readyMissCount).toBe(0);
  });

  test('leaving the room while seated resets the pair for whoever remains', () => {
    const room = roomWithTwoSeated();
    roomManager.confirmStart('host');
    roomManager.registerReadyMiss(room.roomId); // miss 1
    expect(room.readyMissCount).toBe(1);

    roomManager.leaveRoom('guest');

    expect(room.readyMissCount).toBe(0);
    expect(room.users.get('host').ready).toBe(false);
  });

  // ── Defensive edge cases ───────────────────────────────────────────────────

  test('registerReadyMiss on a room with fewer than 2 seated players is a no-op', () => {
    const { room } = roomManager.createRoom(
      { userId: 'solo', displayName: 'Solo', isGuest: false, ip: '198.51.100.21' }
    );
    roomManager.sitDown('solo', 1);

    const { kicked, missCount } = roomManager.registerReadyMiss(room.roomId);

    expect(kicked).toBeNull();
    expect(missCount).toBe(0);
    expect(room.readyMissCount).toBe(0);
  });

  test('registerReadyMiss on an unknown roomId does not throw', () => {
    const result = roomManager.registerReadyMiss('#NOPE');
    expect(result).toEqual({ room: null, kicked: null, missCount: 0 });
  });
});

describe('config — idle scan interval', () => {
  test('the real value is a positive number', () => {
    expect(typeof realConfig.IDLE_SCAN_INTERVAL_MS).toBe('number');
    expect(realConfig.IDLE_SCAN_INTERVAL_MS).toBeGreaterThan(0);
  });

  test('the scan runs more often than the timeout it enforces', () => {
    // A scan cadence at or above IDLE_TIMEOUT_MS would let an idle room live
    // for up to twice the timeout before anything noticed it.
    expect(realConfig.IDLE_SCAN_INTERVAL_MS).toBeLessThan(realConfig.IDLE_TIMEOUT_MS);
  });
});

// ── listRooms userCount excludes ghost viewers (TODO.md #158) ─────────────
// A disconnected spectator (slot === null) has no cleanup timeout and lingers
// in room.users indefinitely; it must not inflate the lobby room-card count.
// A disconnected seated player (in grace, mid-reconnect) still counts.

describe('RoomManager — listRooms userCount vs. ghost viewers (TODO.md #158)', () => {
  beforeEach(() => {
    for (const [roomId] of [...roomManager.rooms]) roomManager._destroyRoom(roomId);
    roomManager.rooms.clear();
    roomManager.userRoomMap.clear();
  });

  function makeRoom() {
    const { room } = roomManager.createRoom(
      { userId: 'host', displayName: 'Host', isGuest: false, ip: '198.51.100.50' }
    );
    return room;
  }

  function listedCount(roomId) {
    return roomManager.listRooms().find((r) => r.roomId === roomId).userCount;
  }

  test('all-active room counts everyone', () => {
    const room = makeRoom();
    roomManager.joinRoom({ userId: 'p1', displayName: 'P1', isGuest: false }, room.roomId);
    roomManager.joinRoom({ userId: 'v1', displayName: 'V1', isGuest: true }, room.roomId);
    expect(listedCount(room.roomId)).toBe(3);
  });

  test('a disconnected viewer is excluded from the count', () => {
    const room = makeRoom();
    roomManager.joinRoom({ userId: 'v1', displayName: 'V1', isGuest: true }, room.roomId);
    room.users.get('v1').presence = 'disconnected';
    expect(listedCount(room.roomId)).toBe(1); // host only
  });

  test('an away viewer still counts (only disconnected is a ghost)', () => {
    const room = makeRoom();
    roomManager.joinRoom({ userId: 'v1', displayName: 'V1', isGuest: true }, room.roomId);
    room.users.get('v1').presence = 'away';
    expect(listedCount(room.roomId)).toBe(2);
  });

  test('a disconnected seated player still counts (grace / mid-reconnect)', () => {
    const room = makeRoom();
    roomManager.joinRoom({ userId: 'p1', displayName: 'P1', isGuest: false }, room.roomId);
    roomManager.sitDown('p1', 1);
    room.users.get('p1').presence = 'disconnected';
    expect(listedCount(room.roomId)).toBe(2);
  });

  test('multiple ghost viewers are all excluded', () => {
    const room = makeRoom();
    for (const id of ['v1', 'v2', 'v3']) {
      roomManager.joinRoom({ userId: id, displayName: id, isGuest: true }, room.roomId);
      room.users.get(id).presence = 'disconnected';
    }
    roomManager.joinRoom({ userId: 'v4', displayName: 'V4', isGuest: true }, room.roomId);
    expect(listedCount(room.roomId)).toBe(2); // host + active v4
  });
});
