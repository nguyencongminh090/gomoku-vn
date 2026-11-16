// #372 — site-wide presence: away (tab hidden / unfocused) counts as offline everywhere.
jest.mock('../socket/home-feed', () => ({ scheduleHomeUpdate: () => {}, register: () => {} })); // keep the DB-backed Home feed out
const state = require('../socket/state');

const sock = (id) => ({ user: { userId: id, displayName: id.toUpperCase(), isGuest: false } });

describe('site-wide presence (#372)', () => {
  beforeEach(() => { state.sessions.clear(); state.awayUsers.clear(); });

  test('connected + no report = present; away = not present, not in online list', () => {
    state.sessions.set('a', sock('a'));
    expect(state.isPresent('a')).toBe(true);
    expect(state.getOnlineUsersList().map(u => u.userId)).toEqual(['a']);
    expect(state.setUserPresence('a', 'away')).toBe(true);
    expect(state.isPresent('a')).toBe(false);
    expect(state.isVisiblyOnline('a')).toBe(false);
    expect(state.getOnlineUsersList()).toEqual([]);
  });

  test('back to active restores; repeat report is not a change', () => {
    state.sessions.set('a', sock('a'));
    state.setUserPresence('a', 'away');
    expect(state.setUserPresence('a', 'away')).toBe(false);
    expect(state.setUserPresence('a', 'active')).toBe(true);
    expect(state.isVisiblyOnline('a')).toBe(true);
  });

  test('not connected is never present', () => {
    expect(state.isPresent('ghost')).toBe(false);
  });
});

describe('HTTP heartbeat (#372)', () => {
  beforeEach(() => { state.sessions.clear(); state.awayUsers.clear(); state.heartbeats.clear(); });
  const u = { userId: 'h', displayName: 'H', isGuest: false };

  test('socket-less member with a fresh active beat is present and listed', () => {
    state.touchHeartbeat(u, 'active');
    expect(state.isPresent('h')).toBe(true);
    expect(state.isVisiblyOnline('h')).toBe(true);
    expect(state.getOnlineUsersList().map(x => x.userId)).toEqual(['h']);
  });

  test('away beat, or an expired one, is not present', () => {
    state.touchHeartbeat(u, 'away');
    expect(state.isPresent('h')).toBe(false);
    expect(state.getOnlineUsersList()).toEqual([]);
    state.touchHeartbeat(u, 'active', Date.now() - state.BEAT_TTL_MS - 1000);
    expect(state.isPresent('h')).toBe(false);
    state.pruneHeartbeats();
    expect(state.heartbeats.has('h')).toBe(false);
  });

  test('union: away socket + active beat = present, listed once', () => {
    state.sessions.set('h', { user: u });
    state.setUserPresence('h', 'away');
    state.touchHeartbeat(u, 'active');
    expect(state.isPresent('h')).toBe(true);
    expect(state.getOnlineUsersList()).toHaveLength(1);
  });

  test('hidden-online beat-only user is not listed', () => {
    state.setHideOnline('h', true);
    state.touchHeartbeat(u, 'active');
    expect(state.getOnlineUsersList()).toEqual([]);
    state.setHideOnline('h', false);
  });
});

// #372 review fixes.
describe('presence review (#372)', () => {
  const u = { userId: 'h', displayName: 'H', isGuest: false };
  let io, emitted;
  beforeEach(() => {
    jest.useFakeTimers();
    state.sessions.clear(); state.awayUsers.clear(); state.heartbeats.clear();
    emitted = [];
    io = { to: () => ({ emit: (ev, data) => emitted.push({ ev, data }) }) };
    state.broadcastOnlineUsers(io); // registers io as the broadcast target
    jest.advanceTimersByTime(state.ONLINE_USERS_DEBOUNCE_MS + 1);
    emitted = [];
  });
  afterEach(() => { state.setHideOnline('h', false); state.heartbeats.clear(); state.sessions.clear(); state.awayUsers.clear(); flush(); jest.useRealTimers(); });
  const flush = () => jest.advanceTimersByTime(state.ONLINE_USERS_DEBOUNCE_MS + 1);
  const left = () => emitted.filter(e => e.ev === 'lobby:online_patch').flatMap(e => e.data.left);

  test('hide_online turned on from a socket-less page (heartbeat only) is pushed to the lobby', () => {
    state.touchHeartbeat(u, 'active');
    flush();
    emitted = [];
    state.setHideOnline('h', true);
    flush();
    expect(left()).toEqual(['h']);
  });

  test('dropHeartbeat (logout / lock) removes a beat-only user at once', () => {
    state.touchHeartbeat(u, 'active');
    flush();
    emitted = [];
    expect(state.dropHeartbeat('h')).toBe(true);
    expect(state.isPresent('h')).toBe(false);
    flush();
    expect(left()).toEqual(['h']);
    expect(state.dropHeartbeat('h')).toBe(false);
  });

  test('hasPresentSocket: only a visible socket — not a heartbeat, not an away socket', () => {
    state.touchHeartbeat(u, 'active');
    expect(state.isPresent('h')).toBe(true);
    expect(state.hasPresentSocket('h')).toBe(false); // no socket to push a DM to → bell entry needed
    state.sessions.set('h', { user: u });
    expect(state.hasPresentSocket('h')).toBe(true);
    state.setUserPresence('h', 'away');
    expect(state.hasPresentSocket('h')).toBe(false);
  });
});
