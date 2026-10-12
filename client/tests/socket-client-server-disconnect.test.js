/**
 * #227 — gracefulShutdown makes the server call disconnect(), which the client
 * sees as reason `io server disconnect`; socket.io never auto-retries that, so
 * every open tab stayed dead after a deploy restart. The client must reconnect
 * by hand (jittered), flag it as a reconnect, and NOT do so after a kick.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'socket-client.js'), 'utf8');

function setup() {
  const handlers = {};
  const sock = {
    connected: false,
    auth: {},
    on: jest.fn((e, cb) => { handlers[e] = cb; }),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    io: { on: jest.fn() },
  };
  delete window.SocketClient;
  window.__gvnSharedClient = null;
  window.io = () => sock;
  window.GvnSession = { hasBelievedSession: () => true, legacyToken: () => null };
  window.eval(SRC);
  const client = new window.SocketClient();
  return { sock, handlers, client };
}

describe('#227 reconnect after io server disconnect', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('server disconnect → connect() after 1–5 s, with reconnect flag', () => {
    const { sock, handlers } = setup();
    handlers.disconnect('io server disconnect');
    jest.advanceTimersByTime(999);
    expect(sock.connect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(4001);
    expect(sock.connect).toHaveBeenCalledTimes(1);
    expect(sock.auth.reconnect).toBe(true);
  });

  test.each(['transport close', 'ping timeout', 'io client disconnect'])(
    '%s is left to socket.io (no manual connect)', (reason) => {
      const { sock, handlers } = setup();
      handlers.disconnect(reason);
      jest.advanceTimersByTime(10000);
      expect(sock.connect).not.toHaveBeenCalled();
    });

  test('session:kicked destroys the client, so no reconnect follows', () => {
    const { sock, handlers } = setup();
    handlers['session:kicked']({ code: 'ACCOUNT_LOCKED' });
    handlers.disconnect('io server disconnect');
    jest.advanceTimersByTime(10000);
    expect(sock.connect).not.toHaveBeenCalled();
  });

  test('already reconnected by the time the timer fires → no second connect', () => {
    const { sock, handlers } = setup();
    handlers.disconnect('io server disconnect');
    sock.connected = true;
    jest.advanceTimersByTime(10000);
    expect(sock.connect).not.toHaveBeenCalled();
  });
});
