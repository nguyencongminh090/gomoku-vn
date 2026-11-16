'use strict';

/**
 * online-users-delta.test.js — #230: `lobby:online_users` is a snapshot sent
 * once per `lobby:subscribe`; debounced flushes send `lobby:online_patch`
 * `{ joined, left }` diffed against the last flush, not the whole list.
 *
 * Real state.js; sessions are driven directly (one entry per userId).
 */

jest.useFakeTimers();

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../socket/home-feed', () => ({ scheduleHomeUpdate: jest.fn() }));

const {
  sessions, setHideOnline, broadcastOnlineUsers, sendOnlineSnapshot, ONLINE_USERS_DEBOUNCE_MS,
  queryOnlineUsers, ONLINE_PAGE_SIZE, ONLINE_PAGE_CACHE_MS,
} = require('../socket/state');

function makeIo() {
  const lobby = [];
  return { lobby, to: (room) => ({ emit: (event, data) => { if (room === 'lobby') lobby.push({ event, data }); } }) };
}
function makeSocket() {
  const emitted = [];
  return { emitted, emit: (event, data) => emitted.push({ event, data }) };
}
const online = (userId, displayName = userId) => {
  sessions.set(userId, { id: 'sock-' + userId, user: { userId, displayName, isGuest: false } });
};
const patches = (io) => io.lobby.filter(e => e.event === 'lobby:online_patch').map(e => e.data);
const flush = (io) => { broadcastOnlineUsers(io); jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS); };
const ids = (list) => list.map(u => u.userId).sort();

// Mirror of client/js/lobby.js applyOnlineUsersPatch (jsdom-tested in client/tests/online-users-patch.test.js).
function apply(users, { joined, left }) {
  const m = new Map(users.map(u => [u.userId, u]));
  for (const id of left) m.delete(id);
  for (const u of joined) m.set(u.userId, u);
  return [...m.values()];
}

beforeEach(() => { sessions.clear(); setHideOnline('h', false); });
afterAll(() => sessions.clear());

describe('lobby:online_patch', () => {
  test('subscribe sends the full list as lobby:online_users', () => {
    const io = makeIo(); const s = makeSocket();
    online('a'); online('b');
    sendOnlineSnapshot(io, s);
    expect(s.emitted).toEqual([{ event: 'lobby:online_users', data: [
      { userId: 'a', displayName: 'a', isGuest: false, avatarUrl: null }, { userId: 'b', displayName: 'b', isGuest: false, avatarUrl: null },
    ] }]);
  });

  test('a flush carries only the churned users, not the whole list', () => {
    const io = makeIo();
    for (let i = 0; i < 50; i++) online('u' + i);
    sendOnlineSnapshot(io, makeSocket());
    online('new'); sessions.delete('u3');
    flush(io);
    expect(patches(io)).toEqual([{ joined: [{ userId: 'new', displayName: 'new', isGuest: false, avatarUrl: null }], left: ['u3'] }]);
  });

  test('nothing changed → nothing emitted', () => {
    const io = makeIo();
    online('a');
    sendOnlineSnapshot(io, makeSocket());
    flush(io);
    expect(patches(io)).toEqual([]);
  });

  test('join + leave of different users in one window → one patch with both', () => {
    const io = makeIo();
    online('a');
    sendOnlineSnapshot(io, makeSocket());
    online('b'); sessions.delete('a');
    flush(io);
    expect(patches(io)).toEqual([{ joined: [expect.objectContaining({ userId: 'b' })], left: ['a'] }]);
  });

  test('a user who connects and disconnects within one window is not sent at all', () => {
    const io = makeIo();
    sendOnlineSnapshot(io, makeSocket());
    online('x'); broadcastOnlineUsers(io); sessions.delete('x');
    jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS);
    expect(patches(io)).toEqual([]);
  });

  test('trap: a socket that subscribed mid-window while a short-lived user was online gets their `left`', () => {
    const io = makeIo(); const late = makeSocket();
    online('a');
    sendOnlineSnapshot(io, makeSocket());            // baseline = [a]
    online('x'); broadcastOnlineUsers(io);           // window opens
    jest.advanceTimersByTime(ONLINE_PAGE_CACHE_MS);  // #381: past the snapshot cache, so the page is rebuilt
    sendOnlineSnapshot(io, late);                    // late subscriber's snapshot holds x
    expect(ids(late.emitted[0].data)).toEqual(['a', 'x']);
    sessions.delete('x');
    jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS - ONLINE_PAGE_CACHE_MS);
    const client = apply(late.emitted[0].data, patches(io)[0]);
    expect(ids(client)).toEqual(['a']);
    expect(patches(io)[0].left).toEqual(['x']);
  });

  test('a subscriber whose snapshot already has the next patch converges (idempotent apply)', () => {
    const io = makeIo(); const early = makeSocket(); const late = makeSocket();
    online('a');
    sendOnlineSnapshot(io, early);
    online('b'); sessions.delete('a'); broadcastOnlineUsers(io);
    sendOnlineSnapshot(io, late);                    // already [b]
    jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS);
    const p = patches(io)[0];
    expect(ids(apply(early.emitted[0].data, p))).toEqual(['b']);
    expect(ids(apply(late.emitted[0].data, p))).toEqual(['b']);
  });

  test('hide-online toggle emits left, unhide emits joined', () => {
    const io = makeIo();
    online('h'); online('a');
    sendOnlineSnapshot(io, makeSocket());
    broadcastOnlineUsers(io); // seeds _lastIo, which setHideOnline re-broadcasts through
    jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS);
    setHideOnline('h', true);
    jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS);
    setHideOnline('h', false);
    jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS);
    expect(patches(io)).toEqual([
      { joined: [], left: ['h'] },
      { joined: [{ userId: 'h', displayName: 'h', isGuest: false, avatarUrl: null }], left: [] },
    ]);
  });

  test('same user in a second tab (session replaced) is not a change', () => {
    const io = makeIo();
    online('a', 'Alice');
    sendOnlineSnapshot(io, makeSocket());
    online('a', 'Alice'); // new socket replaces the session entry
    flush(io);
    expect(patches(io)).toEqual([]);
  });

  test('a changed entry (rename) is re-sent in joined', () => {
    const io = makeIo();
    online('a', 'Alice');
    sendOnlineSnapshot(io, makeSocket());
    online('a', 'Alicia');
    flush(io);
    expect(patches(io)).toEqual([{ joined: [{ userId: 'a', displayName: 'Alicia', isGuest: false, avatarUrl: null }], left: [] }]);
  });
});

// #381: the snapshot used to carry every online user (1.1 MB at 10 000 online, per lobby open).
describe('first page only (#381)', () => {
  const pad = (i) => 'u' + String(i).padStart(4, '0');
  const fill = (n) => { for (let i = 0; i < n; i++) online(pad(i)); };
  const roomManager = require('../managers/RoomManager');
  afterEach(() => { roomManager.avatarLookup = undefined; });

  test('more online than a page: snapshot = first page by name + the real total', () => {
    const io = makeIo(); const s = makeSocket();
    fill(ONLINE_PAGE_SIZE + 70);
    sendOnlineSnapshot(io, s);
    expect(s.emitted.map(e => e.event)).toEqual(['lobby:online_users', 'lobby:online_patch']);
    expect(s.emitted[0].data.map(u => u.userId)).toEqual(Array.from({ length: ONLINE_PAGE_SIZE }, (_, i) => pad(i)));
    expect(s.emitted[1].data).toEqual({ joined: [], left: [], total: ONLINE_PAGE_SIZE + 70 });
  });

  test('snapshot bytes stop growing with the online count', () => {
    const size = (n) => { sessions.clear(); fill(n); const s = makeSocket(); sendOnlineSnapshot(makeIo(), s); return JSON.stringify(s.emitted).length; };
    expect(size(5000)).toBeLessThan(size(ONLINE_PAGE_SIZE) + 200);
  });

  test('exactly one page online: payload identical to before (no total, one event)', () => {
    const io = makeIo(); const s = makeSocket();
    fill(ONLINE_PAGE_SIZE);
    sendOnlineSnapshot(io, s);
    expect(s.emitted).toHaveLength(1);
    online('zzz'); sessions.delete(pad(0));
    flush(io);
    expect(Object.keys(patches(io)[0]).sort()).toEqual(['joined', 'left']);
  });

  test('a join beyond the page sends only the new total', () => {
    const io = makeIo();
    fill(ONLINE_PAGE_SIZE + 5);
    sendOnlineSnapshot(io, makeSocket());
    online('zzz');
    flush(io);
    expect(patches(io)).toEqual([{ joined: [], left: [], total: ONLINE_PAGE_SIZE + 6 }]);
  });

  test('a join that sorts into the page pushes the last one out (left), count from total', () => {
    const io = makeIo(); const s = makeSocket();
    fill(ONLINE_PAGE_SIZE + 5);
    sendOnlineSnapshot(io, s);
    online('aaa');
    flush(io);
    const p = patches(io)[0];
    expect(p.joined.map(u => u.userId)).toEqual(['aaa']);
    expect(p.left).toEqual([pad(ONLINE_PAGE_SIZE - 1)]);
    expect(p.total).toBe(ONLINE_PAGE_SIZE + 6);
    expect(apply(s.emitted[0].data, p)).toHaveLength(ONLINE_PAGE_SIZE);
  });

  test('dropping back to one page: the list is complete again and total is no longer sent', () => {
    const io = makeIo(); const s = makeSocket();
    fill(ONLINE_PAGE_SIZE + 1);
    sendOnlineSnapshot(io, s);
    sessions.delete(pad(3));
    flush(io);
    const p = patches(io)[0];
    expect(p.total).toBeUndefined();
    expect(ids(apply(s.emitted[0].data, p))).toEqual(ids([...sessions.values()].map(x => x.user)));
  });

  test('a burst of subscribes builds the page once; a flush drops the cache', () => {
    const io = makeIo();
    roomManager.avatarLookup = jest.fn(() => null);
    fill(ONLINE_PAGE_SIZE + 5);
    for (let i = 0; i < 20; i++) sendOnlineSnapshot(io, makeSocket());
    expect(roomManager.avatarLookup).toHaveBeenCalledTimes(ONLINE_PAGE_SIZE);
    online('aaa'); flush(io);
    roomManager.avatarLookup.mockClear();
    const s = makeSocket(); sendOnlineSnapshot(io, s);
    expect(s.emitted[0].data[0].userId).toBe('aaa');
  });

  test('a cached (slightly stale) snapshot still converges with the next patch', () => {
    const io = makeIo(); const late = makeSocket();
    online('a');
    sendOnlineSnapshot(io, makeSocket());   // baseline + cache = [a]
    online('b'); broadcastOnlineUsers(io);
    sendOnlineSnapshot(io, late);           // cached: [a], b missing
    expect(ids(late.emitted[0].data)).toEqual(['a']);
    jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS);
    expect(ids(apply(late.emitted[0].data, patches(io)[0]))).toEqual(['a', 'b']);
  });

  describe('queryOnlineUsers', () => {
    beforeEach(() => { fill(120); online('x1', 'Minh Anh'); online('x2', 'minh khoa'); setHideOnline('x2', false); });

    test('name search is case-insensitive substring, sorted, with counts', () => {
      const r = queryOnlineUsers({ q: ' MINH ' });
      expect(r.users.map(u => u.userId)).toEqual(['x1', 'x2']);
      expect(r).toMatchObject({ total: 122, matched: 2 });
      expect(Object.keys(r.users[0]).sort()).toEqual(['avatarUrl', 'displayName', 'isGuest', 'userId']);
    });

    test('offset pages through an unfiltered list without overlap', () => {
      const a = queryOnlineUsers({});
      const b = queryOnlineUsers({ offset: ONLINE_PAGE_SIZE });
      const c = queryOnlineUsers({ offset: 2 * ONLINE_PAGE_SIZE });
      expect([a.users.length, b.users.length, c.users.length]).toEqual([ONLINE_PAGE_SIZE, ONLINE_PAGE_SIZE, 22]);
      expect(new Set([...a.users, ...b.users, ...c.users].map(u => u.userId)).size).toBe(122);
    });

    test.each([[{ offset: -5 }, ONLINE_PAGE_SIZE], [{ offset: 'x' }, ONLINE_PAGE_SIZE], [{ offset: 9999 }, 0], [{ q: 12 }, ONLINE_PAGE_SIZE], [undefined, ONLINE_PAGE_SIZE]])(
      'bad input %j is clamped', (input, n) => { expect(queryOnlineUsers(input).users).toHaveLength(n); });

    test('ids: which of these are visibly online — hidden and offline are not', () => {
      setHideOnline('x2', true);
      expect(queryOnlineUsers({ ids: ['x1', 'x2', 'nobody', 42, pad(119)] })).toEqual({ online: ['x1', pad(119)] });
      setHideOnline('x2', false);
    });
  });
});
