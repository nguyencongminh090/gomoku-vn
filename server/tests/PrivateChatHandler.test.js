'use strict';

/**
 * PrivateChatHandler.test.js — 1-on-1 private lobby chat (#159).
 *
 * Uses the real state.sessions map + real sanitize/profanity filter; only the
 * logger is mocked. Sockets are lightweight fakes recording .emit() calls.
 */

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const config = require('../config');
const { sessions } = require('../socket/state');
const PrivateChatHandler = require('../socket/handlers/PrivateChatHandler');

function makeSocket(userId, displayName, isGuest = false) {
  const handlers = {};
  return {
    id: 'sock-' + userId,
    user: { userId, displayName, isGuest },
    emit: jest.fn(),
    on: (evt, fn) => { handlers[evt] = fn; },
    _fire: (evt, payload) => handlers[evt] && handlers[evt](payload),
  };
}

const io = {}; // unused by the handler's routing (it emits to specific sockets)

function register(socket) {
  PrivateChatHandler.register(io, socket);
}

/** Last payload the handler emitted on `event` from `socket`. */
function lastEmit(socket, event) {
  const calls = socket.emit.mock.calls.filter(c => c[0] === event);
  return calls.length ? calls[calls.length - 1][1] : undefined;
}

describe('PrivateChatHandler', () => {
  let alice, bob;

  beforeEach(() => {
    sessions.clear();
    // Clear module-level rate-limit + activePeers state left by prior tests.
    ['alice', 'bob', 'carol', 'g1'].forEach(id => PrivateChatHandler.cleanupUser(io, id));
    jest.useFakeTimers();
    alice = makeSocket('alice', 'Alice');
    bob = makeSocket('bob', 'Bob');
    sessions.set('alice', alice);
    sessions.set('bob', bob);
    register(alice);
    register(bob);
    config.PRIVATE_CHAT_ALLOW_GUESTS = true;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    sessions.clear();
  });

  test('valid message reaches recipient and echoes to sender with same messageId', () => {
    alice._fire('private_message:send', { toUserId: 'bob', text: 'hi bob' });

    const toBob = lastEmit(bob, 'private_message:receive');
    const echo = lastEmit(alice, 'private_message:receive');
    expect(toBob).toBeDefined();
    expect(echo).toBeDefined();
    expect(toBob.text).toBe('hi bob');
    expect(toBob.fromUserId).toBe('alice');
    expect(toBob.messageId).toBe(echo.messageId);
    expect(toBob.conversationWith).toBe('alice');
    expect(echo.conversationWith).toBe('bob');
  });

  test('does not leak to any third party / shared room', () => {
    const carol = makeSocket('carol', 'Carol');
    sessions.set('carol', carol);
    register(carol);
    alice._fire('private_message:send', { toUserId: 'bob', text: 'private' });
    expect(carol.emit).not.toHaveBeenCalled();
  });

  test('rejects self-chat', () => {
    alice._fire('private_message:send', { toUserId: 'alice', text: 'me' });
    expect(lastEmit(alice, 'private_message:error')).toEqual({ code: 'CANNOT_CHAT_SELF' });
    expect(bob.emit).not.toHaveBeenCalled();
  });

  test('rejects missing recipient', () => {
    alice._fire('private_message:send', { text: 'no target' });
    expect(lastEmit(alice, 'private_message:error')).toEqual({ code: 'MISSING_RECIPIENT' });
  });

  test('reports RECIPIENT_OFFLINE when target has no session', () => {
    sessions.delete('bob');
    alice._fire('private_message:send', { toUserId: 'bob', text: 'anyone?' });
    expect(lastEmit(alice, 'private_message:error')).toEqual({ code: 'RECIPIENT_OFFLINE' });
  });

  test('rate limit: 5 messages pass in the window, the 6th is blocked', () => {
    for (let i = 0; i < config.PRIVATE_CHAT_RATE_LIMIT; i++) {
      alice._fire('private_message:send', { toUserId: 'bob', text: 'msg ' + i });
    }
    const received = bob.emit.mock.calls.filter(c => c[0] === 'private_message:receive').length;
    expect(received).toBe(5);

    alice._fire('private_message:send', { toUserId: 'bob', text: 'msg 6' });
    expect(lastEmit(alice, 'private_message:error')).toEqual({ code: 'PRIVATE_CHAT_RATE_LIMITED' });

    // Window slides: after the window elapses, sending works again.
    jest.advanceTimersByTime(config.PRIVATE_CHAT_RATE_WINDOW_MS + 1);
    alice._fire('private_message:send', { toUserId: 'bob', text: 'later' });
    expect(lastEmit(bob, 'private_message:receive').text).toBe('later');
  });

  test('escapes angle brackets (XSS)', () => {
    alice._fire('private_message:send', { toUserId: 'bob', text: '<img src=x onerror=alert(1)>' });
    const t = lastEmit(bob, 'private_message:receive').text;
    expect(t).not.toContain('<');
    expect(t).not.toContain('>');
    expect(t).toContain('&lt;');
  });

  test('masks profanity', () => {
    alice._fire('private_message:send', { toUserId: 'bob', text: 'you shit' });
    const t = lastEmit(bob, 'private_message:receive').text;
    expect(t).toMatch(/\*/);
    expect(t.toLowerCase()).not.toContain('shit');
  });

  test('truncates at 500 chars: 500 passes intact, 501 is cut with ellipsis', () => {
    alice._fire('private_message:send', { toUserId: 'bob', text: 'a'.repeat(500) });
    expect(lastEmit(bob, 'private_message:receive').text).toBe('a'.repeat(500));

    jest.advanceTimersByTime(config.PRIVATE_CHAT_RATE_WINDOW_MS + 1);
    alice._fire('private_message:send', { toUserId: 'bob', text: 'b'.repeat(501) });
    const t = lastEmit(bob, 'private_message:receive').text;
    expect(t.length).toBe(501); // 500 chars + ellipsis
    expect(t.endsWith('…')).toBe(true);
  });

  test('empty / whitespace-only message is silently ignored', () => {
    alice._fire('private_message:send', { toUserId: 'bob', text: '   ' });
    expect(bob.emit).not.toHaveBeenCalled();
    expect(alice.emit).not.toHaveBeenCalled();
  });

  test('guest is blocked when PRIVATE_CHAT_ALLOW_GUESTS is false', () => {
    config.PRIVATE_CHAT_ALLOW_GUESTS = false;
    const guest = makeSocket('g1', 'Guest', true);
    sessions.set('g1', guest);
    register(guest);

    guest._fire('private_message:send', { toUserId: 'bob', text: 'hey' });
    expect(lastEmit(guest, 'private_message:error')).toEqual({ code: 'GUEST_CHAT_DISABLED' });

    // Sending TO a guest is also blocked.
    alice._fire('private_message:send', { toUserId: 'g1', text: 'hi guest' });
    expect(lastEmit(alice, 'private_message:error')).toEqual({ code: 'GUEST_CHAT_DISABLED' });

    config.PRIVATE_CHAT_ALLOW_GUESTS = true;
  });

  test('cleanupUser notifies active chat partners that the user went offline', () => {
    alice._fire('private_message:send', { toUserId: 'bob', text: 'hi' });
    bob.emit.mockClear();

    sessions.delete('alice');
    PrivateChatHandler.cleanupUser(io, 'alice');

    expect(lastEmit(bob, 'user:status')).toEqual({ userId: 'alice', status: 'offline' });
    expect(lastEmit(bob, 'user:disconnected')).toEqual({ userId: 'alice' });
  });

  test('cleanupUser does NOT notify partners if the user still has a live session', () => {
    alice._fire('private_message:send', { toUserId: 'bob', text: 'hi' });
    bob.emit.mockClear();

    // alice's stale socket disconnects but a newer session replaced it
    PrivateChatHandler.cleanupUser(io, 'alice');
    expect(bob.emit).not.toHaveBeenCalled();
  });
});
