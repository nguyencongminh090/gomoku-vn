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
  for (const file of jsFilesUnder(SOCKET_DIR)) {
    const src = fs.readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (line.includes("emit('room:updated'")) {
        emitSites.push({ file: path.relative(SOCKET_DIR, file), line: i + 1, text: line.trim() });
      }
    });
  }

  test('all 17 sites are still accounted for', () => {
    expect(emitSites).toHaveLength(17);
  });

  test('uses serializeRoomUpdate everywhere except the one settings-change site', () => {
    const withFullSettings = emitSites.filter(s => /serializeRoom\(/.test(s.text));

    // Exactly one: the room:settings handler, the only event where settings
    // actually changed and the client needs the new values.
    expect(withFullSettings).toHaveLength(1);
    expect(withFullSettings[0].file).toBe(path.join('handlers', 'RoomHandler.js'));

    const rest = emitSites.filter(s => !/serializeRoom\(/.test(s.text));
    expect(rest).toHaveLength(16);
    for (const site of rest) {
      expect(site.text).toContain('serializeRoomUpdate(');
    }
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
