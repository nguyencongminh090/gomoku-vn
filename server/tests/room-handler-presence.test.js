'use strict';

// #372 review — `presence:set` / `room:presence` handler (RoomHandler.js):
// an evicted socket can't overwrite the live one's state, and a repeat report doesn't fan out.
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../socket/home-feed', () => ({ scheduleHomeUpdate: jest.fn(), register: jest.fn() }));
const mockRoom = { roomId: 'r1' };
let mockChanged = true;
jest.mock('../managers/RoomManager', () => ({
  on: jest.fn(),
  setPresence: jest.fn(() => ({ room: mockRoom, changed: mockChanged })),
  getRoomIdByUser: jest.fn(() => 'r1'),
}));
jest.mock('../socket/state', () => ({
  ...jest.requireActual('../socket/state'),
  broadcastRoomUpdate: jest.fn(),
}));

const state = require('../socket/state');
const roomManager = require('../managers/RoomManager');
const { register } = require('../socket/handlers/RoomHandler');

function makeSocket(userId) {
  const handlers = {};
  return { user: { userId, displayName: userId, isGuest: false }, handlers, on: (ev, fn) => { handlers[ev] = fn; }, emit: jest.fn() };
}

describe('presence:set handler (#372 review)', () => {
  const io = { to: () => ({ emit: jest.fn() }) };
  beforeEach(() => {
    state.sessions.clear(); state.awayUsers.clear();
    state.broadcastRoomUpdate.mockClear(); roomManager.setPresence.mockClear();
    mockChanged = true;
  });
  afterAll(() => { state.sessions.clear(); state.awayUsers.clear(); });

  test('the live socket reports away → site-wide away + room broadcast', () => {
    const s = makeSocket('a'); register(io, s); state.sessions.set('a', s);
    s.handlers['presence:set']({ presence: 'away' });
    expect(state.awayUsers.has('a')).toBe(true);
    expect(state.broadcastRoomUpdate).toHaveBeenCalledTimes(1);
  });

  test('an evicted socket (no longer the registered one) is ignored', () => {
    const old = makeSocket('a'); register(io, old);
    const live = makeSocket('a'); register(io, live); state.sessions.set('a', live);
    old.handlers['room:presence']({ presence: 'away' });
    expect(state.awayUsers.has('a')).toBe(false);
    expect(roomManager.setPresence).not.toHaveBeenCalled();
  });

  test('a repeat report (room presence unchanged) does not re-broadcast the room', () => {
    const s = makeSocket('a'); register(io, s); state.sessions.set('a', s);
    mockChanged = false;
    s.handlers['presence:set']({ presence: 'active' });
    expect(roomManager.setPresence).toHaveBeenCalledTimes(1);
    expect(state.broadcastRoomUpdate).not.toHaveBeenCalled();
  });
});

// #373: the room member is "watching" only while their socket is the room page of that room.
describe('room presence follows the room page only (#373)', () => {
  const io = { to: () => ({ emit: jest.fn() }) };
  beforeEach(() => { state.sessions.clear(); state.awayUsers.clear(); roomManager.setPresence.mockClear(); });
  afterAll(() => { state.sessions.clear(); state.awayUsers.clear(); });

  test.each([
    // [case, socket.data, event, reported, room presence, site-wide away]
    ['room page, visible', { roomPageId: 'r1' }, 'room:presence', 'active', 'active', false],
    ['room page, hidden', { roomPageId: 'r1' }, 'presence:set', 'away', 'away', true],
    ['lobby/home page, visible', undefined, 'presence:set', 'active', 'away', false],
    ['room page of another room', { roomPageId: 'r9' }, 'room:presence', 'active', 'away', false],
  ])('%s', (_c, data, ev, reported, roomPresence, siteAway) => {
    const s = makeSocket('a'); if (data) s.data = data; register(io, s); state.sessions.set('a', s);
    s.handlers[ev]({ presence: reported });
    expect(roomManager.setPresence).toHaveBeenCalledWith('a', roomPresence);
    expect(state.awayUsers.has('a')).toBe(siteAway);
  });
});
