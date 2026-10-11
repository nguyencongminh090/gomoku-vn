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
      { userId: 'a', displayName: 'a', isGuest: false }, { userId: 'b', displayName: 'b', isGuest: false },
    ] }]);
  });

  test('a flush carries only the churned users, not the whole list', () => {
    const io = makeIo();
    for (let i = 0; i < 50; i++) online('u' + i);
    sendOnlineSnapshot(io, makeSocket());
    online('new'); sessions.delete('u3');
    flush(io);
    expect(patches(io)).toEqual([{ joined: [{ userId: 'new', displayName: 'new', isGuest: false }], left: ['u3'] }]);
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
    sendOnlineSnapshot(io, late);                    // late subscriber's snapshot holds x
    sessions.delete('x');
    jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS);
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
      { joined: [{ userId: 'h', displayName: 'h', isGuest: false }], left: [] },
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
    expect(patches(io)).toEqual([{ joined: [{ userId: 'a', displayName: 'Alicia', isGuest: false }], left: [] }]);
  });
});
