// #372 — site-wide presence: away (tab hidden / unfocused) counts as offline everywhere.
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
