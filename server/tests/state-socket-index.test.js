'use strict';

/**
 * state-socket-index.test.js — userId → Set<socket> index behind findSocketsByUserId (#383).
 *
 * The lookup used to scan io.sockets.sockets (O(connected sockets) per disconnect / kick).
 * It now reads an index maintained at connect / disconnect. `sessions` is not enough: it holds
 * only the NEWEST socket, and DisconnectHandler asks "any OTHER live socket?" — the draining
 * old socket of a user who just reconnected matters there.
 */

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const state = require('../socket/state');
const { findSocketsByUserId, trackSocket, untrackSocket, _userSockets } = state;

const sock = (id, userId) => ({ id, user: { userId } });
// Any touch of io.sockets.sockets is the regression: the lookup must not scan.
const io = { sockets: { get sockets() { throw new Error('scanned io.sockets.sockets'); } } };

describe('findSocketsByUserId — socket index (#383)', () => {
  beforeEach(() => _userSockets.clear());
  afterAll(() => _userSockets.clear());

  test('unknown user → [] without scanning', () => {
    expect(findSocketsByUserId(io, 'nobody')).toEqual([]);
  });

  test('two sockets of one user (old one draining): both found, other users not', () => {
    const a = sock('A', 'u1'), b = sock('B', 'u1'), c = sock('C', 'u2');
    [a, b, c].forEach(trackSocket);
    expect(findSocketsByUserId(io, 'u1')).toEqual([a, b]);
    expect(findSocketsByUserId(io, 'u2')).toEqual([c]);
  });

  test('excludeSocketId skips that socket only', () => {
    const a = sock('A', 'u1'), b = sock('B', 'u1');
    trackSocket(a); trackSocket(b);
    expect(findSocketsByUserId(io, 'u1', 'B')).toEqual([a]);
    expect(findSocketsByUserId(io, 'u1', 'zzz')).toEqual([a, b]);
  });

  test('untracking the old socket leaves the new one; untracking the last drops the entry', () => {
    const a = sock('A', 'u1'), b = sock('B', 'u1');
    trackSocket(a); trackSocket(b);
    untrackSocket(a);
    expect(findSocketsByUserId(io, 'u1')).toEqual([b]);
    untrackSocket(b);
    expect(findSocketsByUserId(io, 'u1')).toEqual([]);
    expect(_userSockets.has('u1')).toBe(false); // no leak across connect/disconnect churn
  });

  test('double track / double untrack / untrack of an unknown socket are harmless', () => {
    const a = sock('A', 'u1');
    trackSocket(a); trackSocket(a);
    expect(findSocketsByUserId(io, 'u1')).toEqual([a]);
    untrackSocket(a); untrackSocket(a); untrackSocket(sock('X', 'u9'));
    expect(_userSockets.size).toBe(0);
  });

  test('returns a copy — callers may not mutate the index', () => {
    const a = sock('A', 'u1');
    trackSocket(a);
    findSocketsByUserId(io, 'u1').pop();
    expect(findSocketsByUserId(io, 'u1')).toEqual([a]);
  });

  test('socket without a user is ignored', () => {
    trackSocket({ id: 'N' }); untrackSocket({ id: 'N' });
    expect(_userSockets.size).toBe(0);
  });
});
