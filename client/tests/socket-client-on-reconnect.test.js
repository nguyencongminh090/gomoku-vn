/**
 * #472 — SocketClient.onReconnect fires on every connect after a disconnect, including the #227
 * manual `sock.connect()` after `io server disconnect` (graceful restart), which never emits the
 * Manager's 'reconnect' event. Not on the first connect.
 *
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'socket-client.js'), 'utf8');

function setup() {
  delete window.SocketClient;
  window.__gvnSharedClient = null;
  let sock;
  window.io = () => {
    const h = {};
    sock = { on: (ev, fn) => (h[ev] = h[ev] || []).push(fn), off() {}, emit() {}, connect() {}, disconnect() {},
      io: { on() {}, opts: {} }, auth: {}, fire: (ev, ...a) => (h[ev] || []).forEach((fn) => fn(...a)) };
    return sock;
  };
  window.GvnSession = { hasBelievedSession: () => true, legacyToken: () => null, applyServerIdentity() {}, getUser: () => null, clearUser() {} };
  window.eval(SRC); // eslint-disable-line no-eval
  return { client: new window.SocketClient(), sock };
}

test('first connect does not fire; each connect after a disconnect fires once', () => {
  const { client, sock } = setup();
  const cb = jest.fn();
  client.onReconnect(cb);
  sock.fire('connect');
  expect(cb).not.toHaveBeenCalled();
  sock.fire('disconnect', 'io server disconnect'); // graceful server restart
  sock.fire('connect');                            // manual sock.connect() path (#227)
  expect(cb).toHaveBeenCalledTimes(1);
  sock.fire('connect');
  expect(cb).toHaveBeenCalledTimes(1);
  sock.fire('disconnect', 'transport close');
  sock.fire('connect');
  expect(cb).toHaveBeenCalledTimes(2);
});
