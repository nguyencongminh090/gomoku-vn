'use strict';

/**
 * privacy-gates.test.js — #199 slice 2: who_can_dm / who_can_challenge / who_can_friend
 * (everyone|friends|nobody) enforced server-side in DmService, ChallengeService, FriendService and
 * the DM socket path, and surfaced as `can` on the profile. Real SQL on an in-memory DB.
 */

jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'setTimeout', 'clearTimeout'] });

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const database = require('../db/database');
const gate = require('../managers/PrivacyGate');
const dm = require('../managers/DmService');
const dmText = require('../managers/DmText');
const friends = require('../managers/FriendService');
const challenges = require('../managers/ChallengeService');
const PrivateChatHandler = require('../socket/handlers/PrivateChatHandler');

const NOW = '2026-10-09T00:00:00.000Z';
const db = database.db;
const U = {};

function addUser(name) {
  U[name] = `${name}-id`;
  db.prepare("INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)")
    .run(U[name], name, name.toUpperCase(), NOW);
}
const setPref = (name, col, v) => db.prepare(`UPDATE users SET ${col} = ? WHERE id = ?`).run(v, U[name]);
const befriend = (a, b) => { friends.request(U[a], b); friends.acceptRequest(U[b], a); };
const code = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };

beforeAll(() => { ['ann', 'bob', 'cat'].forEach(addUser); });
beforeEach(() => {
  for (const n of Object.keys(U)) for (const c of ['who_can_dm', 'who_can_challenge', 'who_can_friend']) setPref(n, c, 'everyone');
  db.prepare('DELETE FROM friendships').run();
  db.prepare('DELETE FROM direct_messages').run();
  challenges._reset();
  for (const id of Object.values(U)) dmText.forget(id);
});

describe('PrivacyGate.allowed', () => {
  test.each([
    ['everyone', false, true],
    ['everyone', true, true],
    ['friends', false, false],
    ['friends', true, true],
    ['nobody', false, false],
    ['nobody', true, false],
  ])('setting %s, friends=%s → %s', (setting, areFriends, expected) => {
    if (areFriends) befriend('ann', 'bob');
    for (const [action, col] of [['dm', 'who_can_dm'], ['challenge', 'who_can_challenge'], ['friend', 'who_can_friend']]) {
      setPref('bob', col, setting);
      expect(gate.allowed(U.ann, U.bob, action)).toBe(expected);
    }
  });

  test('the setting is the RECIPIENT\'s, not the sender\'s', () => {
    setPref('ann', 'who_can_dm', 'nobody');
    expect(gate.allowed(U.ann, U.bob, 'dm')).toBe(true);
    expect(gate.allowed(U.bob, U.ann, 'dm')).toBe(false);
  });

  test('unknown action throws', () => {
    expect(() => gate.allowed(U.ann, U.bob, 'poke')).toThrow();
  });
});

describe('enforcement', () => {
  test('DM REST path: refused for nobody/friends-only strangers, allowed for friends, replies gated by the other side', () => {
    setPref('bob', 'who_can_dm', 'friends');
    expect(code(() => dm.send(U.ann, 'bob', 'hi'))).toBe('DM_NOT_ALLOWED');
    befriend('ann', 'bob');
    expect(code(() => dm.send(U.ann, 'bob', 'hi'))).toBeNull();
    setPref('ann', 'who_can_dm', 'nobody');
    expect(code(() => dm.send(U.bob, 'ann', 'reply'))).toBe('DM_NOT_ALLOWED');
    expect(db.prepare('SELECT COUNT(*) AS n FROM direct_messages').get().n).toBe(1);
  });

  test('DM socket path: refused with DM_NOT_ALLOWED and nothing stored', () => {
    setPref('bob', 'who_can_dm', 'nobody');
    PrivateChatHandler.setStore({ isMember: () => true, save: dm.save });
    const handlers = {};
    const socket = { user: { userId: U.ann, displayName: 'ANN' }, emit: jest.fn(), on: (ev, fn) => { handlers[ev] = fn; } };
    PrivateChatHandler.register({}, socket);
    handlers['private_message:send']({ toUserId: U.bob, text: 'hi' });
    expect(socket.emit).toHaveBeenCalledWith('private_message:error', { code: 'DM_NOT_ALLOWED' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM direct_messages').get().n).toBe(0);
    setPref('bob', 'who_can_dm', 'everyone');
    handlers['private_message:send']({ toUserId: U.bob, text: 'hi' });
    expect(db.prepare('SELECT COUNT(*) AS n FROM direct_messages').get().n).toBe(1);
  });

  test('challenge: nobody blocks, friends-only needs friendship; checked before rule validation', () => {
    const opts = { rule: 'freestyle', time: '3+2', rated: false };
    setPref('bob', 'who_can_challenge', 'nobody');
    expect(code(() => challenges.send(U.ann, 'bob', opts))).toBe('CHALLENGE_NOT_ALLOWED');
    setPref('bob', 'who_can_challenge', 'friends');
    expect(code(() => challenges.send(U.ann, 'bob', opts))).toBe('CHALLENGE_NOT_ALLOWED');
    befriend('ann', 'bob');
    expect(code(() => challenges.send(U.ann, 'bob', opts))).toBeNull();
  });

  test('friend request: nobody blocks a NEW request; a crossed request still completes', () => {
    setPref('bob', 'who_can_friend', 'nobody');
    expect(code(() => friends.request(U.ann, 'bob'))).toBe('FRIEND_REQUEST_NOT_ALLOWED');
    // bob asks ann first, then ann (whose gate is open) answers via request → friends; and bob's own gate no longer matters
    friends.request(U.bob, 'ann');
    expect(friends.request(U.ann, 'bob')).toBe('friends');
  });

  test('friend request: "friends" setting acts like nobody for strangers', () => {
    setPref('bob', 'who_can_friend', 'friends');
    expect(code(() => friends.request(U.cat, 'bob'))).toBe('FRIEND_REQUEST_NOT_ALLOWED');
  });
});
