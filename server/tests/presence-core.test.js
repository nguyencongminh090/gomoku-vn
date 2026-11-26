'use strict';

/**
 * presence-core.test.js — #487, the one status derivation (features/presence-status planning §2).
 *
 * Row map (planning §2e user scope U*, §2f member scope M*). Rows whose behaviour lives in a handler are
 * covered by the integration block below (real state.js / RoomManager / handlers) or by an existing suite:
 *   U1-U3, U10, U11, U12, U15-U18      → pure + integration tests here
 *   U4, U19 (evicted / older socket)    → here + room-handler-presence.test.js, SocketHandler.test.js "kicks the first socket"
 *   U5-U8 (drop, grace, reconnect)       → integration here; DisconnectHandler.test.js grace lifecycle
 *   U9, U13 (beat expiry, logout)        → here; presence-global.test.js
 *   U14 (server restart)                 → here (fresh module registry)
 *   M1, M10 (room:join from room page)   → LobbyHandler.test.js "#373: room:join from the room page…"
 *   M2-M4 (room page / other page)       → room-handler-presence.test.js (#373 table) + here
 *   M5-M9 (drop, bounce, back, expiry, late report) → here; DisconnectHandler.test.js; SocketHandler.test.js "#422 …"
 *   M11 (room:leave resigns)             → unchanged by #487 (RoomHandler room:leave)
 */

const core = require('../presence/presence-core');

const NOW = 1_000_000;
const beat = (at, away = false) => ({ at, away });
const tabs = (...list) => ({ user: {}, tabs: new Map(list.map((b, i) => [`t${i}`, b])) });

describe('user scope: connection + attention (pure)', () => {
  test.each([
    // [row, facts, conn, attn]
    ['U1 offline → socket connects', { hasSocket: true }, 'online', 'active'],
    ['U2 socket reports away', { hasSocket: true, socketAway: true }, 'online', 'away'],
    ['U3 socket active again', { hasSocket: true, socketAway: false }, 'online', 'active'],
    ['U5 no socket, no beat, no grace', {}, 'offline', 'away'],
    ['U6 no socket, grace pending', { inGrace: true }, 'reconnecting', 'away'],
    ['U9 beat older than the TTL', { beat: tabs(beat(NOW - core.BEAT_TTL_MS - 1)) }, 'offline', 'away'],
    ['U10 socket page hidden + beat tab active', { hasSocket: true, socketAway: true, beat: tabs(beat(NOW)) }, 'online', 'active'],
    ['U11 beat tab A active + tab B away', { beat: tabs(beat(NOW - 5000), beat(NOW, true)) }, 'online', 'active'],
    ['U11 every beat tab away', { beat: tabs(beat(NOW, true), beat(NOW, true)) }, 'online', 'away'],
    ['legacy single-slot beat entry still read', { beat: { at: NOW, away: false, user: {} } }, 'online', 'active'],
  ])('%s', (_row, facts, conn, attn) => {
    expect(core.userConn(facts, NOW)).toEqual({ conn, attn });
  });

  test('isPresent / hasPresentSocket / isVisiblyOnline keep the #372 meanings', () => {
    const beatOnly = { beat: tabs(beat(NOW)) };
    expect(core.isPresent(beatOnly, NOW)).toBe(true);
    expect(core.hasPresentSocket(beatOnly)).toBe(false); // a beat page has no socket for a live push
    expect(core.hasPresentSocket({ hasSocket: true, socketAway: true })).toBe(false);
    expect(core.isVisiblyOnline({ hasSocket: true, hidden: true }, NOW)).toBe(false); // U12
    expect(core.isVisiblyOnline({ hasSocket: true }, NOW)).toBe(true);
  });
});

describe('member scope (pure)', () => {
  test.each([
    [{ presence: 'active' }, 'active'],
    [{ presence: 'away' }, 'away'],
    [{ presence: 'disconnected' }, 'gone'],
    [{ presence: 'junk' }, 'active'], // U15: an unknown value never reads as gone
    [{}, 'active'],
    [null, 'gone'],
  ])('memberAt(%j) = %s', (u, at) => expect(core.memberAt(u)).toBe(at));

  test('ghost viewer = unseated and gone; a seated player in grace is not one (#158)', () => {
    expect(core.isGhostViewer({ slot: null, presence: 'disconnected' })).toBe(true);
    expect(core.isGhostViewer({ slot: 1, presence: 'disconnected' })).toBe(false);
    expect(core.isGhostViewer({ slot: null, presence: 'away' })).toBe(false);
    expect(core.isConnectedMember({ presence: 'away' })).toBe(true);
    expect(core.isConnectedMember({ presence: 'disconnected' })).toBe(false);
  });
});

describe('activity (pure)', () => {
  const room = (state, users, status = 'ongoing') => ({
    roomId: 'R', state, users: new Map(users.map((u) => [u.userId, u])),
    gameState: status ? { status, startedAt: 42 } : null,
  });
  const a = { userId: 'a', slot: 1, presence: 'active' };
  const v = { userId: 'v', slot: null, presence: 'active' };

  test.each([
    ['U17 seated in a running game', room('playing', [a]), {}, { kind: 'playing', roomId: 'R', since: 42 }],
    ['problem 3: seated, game interrupted (opponent in grace) is still playing', room('interrupted', [a]), {}, { kind: 'playing', roomId: 'R', since: 42 }],
    ['seated, game not started', room('idle', [a], null), {}, { kind: 'idle' }],
    ['seated, game finished', room('playing', [a], 'finished'), {}, { kind: 'idle' }],
    ['U16 queued for a match', null, { queued: true }, { kind: 'searching' }],
    ['U18 in a tournament match wins over everything', room('playing', [a]), { tournament: true }, { kind: 'tournament' }],
    ['nothing', null, {}, { kind: 'idle' }],
  ])('%s', (_c, r, extra, want) => {
    expect(core.activityOf('a', { room: r, ...extra })).toEqual(want);
  });

  test('viewer watching; a viewer who left the site is not', () => {
    expect(core.activityOf('v', { room: room('playing', [a, v]) })).toEqual({ kind: 'watching', roomId: 'R' });
    expect(core.activityOf('v', { room: room('playing', [a, { ...v, presence: 'disconnected' }]) })).toEqual({ kind: 'idle' });
  });
});

describe('projection per audience (planning §2d)', () => {
  const playing = { conn: 'online', attn: 'away', activity: { kind: 'playing', roomId: 'R', since: 42 }, hidden: false };
  test.each([
    ['self', { c: 'on', a: 1, k: 'play', r: 'R', t: 42 }],
    ['room', { c: 'on', a: 1, k: 'play', r: 'R', t: 42 }],
    ['friend', { c: 'on', a: 1, k: 'play', r: 'R', t: 42 }],
    ['public', { c: 'off' }], // strangers: away reads as offline (#372), never what or where
    ['staff', { c: 'on', a: 1, k: 'play', r: 'R', t: 42 }],
    ['bogus', { c: 'off' }], // unknown audience = public
  ])('%s', (aud, want) => expect(core.project(playing, aud)).toEqual(want));

  test('hidden-online: offline to friends and the public, truth to self / room / staff (Q7 A)', () => {
    const hidden = { ...playing, hidden: true };
    expect(core.project(hidden, 'friend')).toEqual({ c: 'off' });
    expect(core.project(hidden, 'public')).toEqual({ c: 'off' });
    expect(core.project(hidden, 'room').c).toBe('on');
    expect(core.project(hidden, 'self').c).toBe('on');
    expect(core.project(hidden, 'staff').c).toBe('on');
  });

  test('reconnecting keeps the activity for friends; offline carries nothing', () => {
    expect(core.project({ conn: 'reconnecting', attn: 'away', activity: { kind: 'playing', roomId: 'R' } }, 'friend')).toEqual({ c: 're', k: 'play', r: 'R' });
    expect(core.project({ conn: 'offline', attn: 'away', activity: { kind: 'playing', roomId: 'R' } }, 'friend')).toEqual({ c: 'off' });
  });
});
