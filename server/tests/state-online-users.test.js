'use strict';

/**
 * state-online-users.test.js — shape of getOnlineUsersList() (#159).
 *
 * It used to return a bare sorted `string[]` of display names. Private Chat
 * needs the userId (to route a message) and the guest flag (to badge a row),
 * so it now returns `[{ userId, displayName, isGuest }]`, still sorted by
 * displayName.
 */

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { sessions, getOnlineUsersList } = require('../socket/state');

function fakeSocket(userId, displayName, isGuest) {
  return { id: 'sock-' + userId, user: { userId, displayName, isGuest } };
}

describe('getOnlineUsersList()', () => {
  beforeEach(() => sessions.clear());
  afterAll(() => sessions.clear());

  test('returns [] when nobody is online', () => {
    expect(getOnlineUsersList()).toEqual([]);
  });

  test('returns one object per session with exactly userId/displayName/isGuest', () => {
    sessions.set('u1', fakeSocket('u1', 'Alice', false));
    const list = getOnlineUsersList();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ userId: 'u1', displayName: 'Alice', isGuest: false });
    expect(Object.keys(list[0]).sort()).toEqual(['displayName', 'isGuest', 'userId']);
  });

  test('sorts by displayName, not insertion order', () => {
    sessions.set('u3', fakeSocket('u3', 'Charlie', false));
    sessions.set('u1', fakeSocket('u1', 'alice', false));
    sessions.set('u2', fakeSocket('u2', 'Bob', false));
    expect(getOnlineUsersList().map(u => u.displayName)).toEqual(['alice', 'Bob', 'Charlie']);
  });

  test('reflects isGuest per session and coerces missing/truthy values to boolean', () => {
    sessions.set('g1', fakeSocket('g1', 'Guest-1', true));
    sessions.set('m1', fakeSocket('m1', 'Member-1', undefined));
    const byId = Object.fromEntries(getOnlineUsersList().map(u => [u.userId, u]));
    expect(byId.g1.isGuest).toBe(true);
    expect(byId.m1.isGuest).toBe(false);
  });
});
