/**
 * #435 — own chat emitted into a silently dead socket was lost for good (fire-and-forget emit, no echo).
 * room.js now sends chat with an ack; a missed ack resends the SAME cid once connected; after 3 misses a
 * "not sent" line appears instead of silent loss.
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/room.html?id=%23ABC"}
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
const BODY_HTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];

let calls; let sock; let onceHandlers;
function loadRoom() {
  jest.resetModules();
  document.body.innerHTML = BODY_HTML;
  calls = []; onceHandlers = {};
  sock = { connected: true, once: jest.fn((e, cb) => { onceHandlers[e] = cb; }) };
  window.GvnSession = { requireAuth: jest.fn(), getUser: jest.fn(() => ({ userId: 'u-1', displayName: 'T', isGuest: false })) };
  window.t = jest.fn((k, p) => k + (p && p.text ? ':' + p.text : ''));
  window.requestAnimationFrame = jest.fn((cb) => cb());
  window.ChatUI = { appendSystemMessage: jest.fn() };
  window.SocketClient = class {
    constructor() { this.emit = jest.fn(); this.socket = sock; }
    emitAck(event, data, ms, cb) { calls.push({ event, data, ms, cb }); }
    on() {} bindStatusBanner() {} static shared() { return new this(); }
  };
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  window.RoomState = { mySlot: null, roomData: { users: [] }, gameState: null };
  require('../js/room.js');
}
function send(text) {
  const input = document.getElementById('chat-input');
  input.value = text;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}

test('chat goes out with an ack deadline and a client id', () => {
  loadRoom();
  send('hi');
  expect(calls).toHaveLength(1);
  expect(calls[0].event).toBe('chat:message');
  expect(calls[0].data.text).toBe('hi');
  expect(typeof calls[0].data.cid).toBe('string');
  expect(calls[0].ms).toBeGreaterThan(0);
});

test('acked → no resend, no warning', () => {
  loadRoom();
  send('hi');
  calls[0].cb(null, { ok: true });
  expect(calls).toHaveLength(1);
  expect(window.ChatUI.appendSystemMessage).not.toHaveBeenCalled();
});

test('missed ack while connected → resent at once with the same cid', () => {
  loadRoom();
  send('hi');
  calls[0].cb(new Error('timeout'));
  expect(calls).toHaveLength(2);
  expect(calls[1].data).toEqual(calls[0].data);
});

test('missed ack while disconnected → resent on the next connect, same cid', () => {
  loadRoom();
  send('hi');
  sock.connected = false;
  calls[0].cb(new Error('socket has been disconnected'));
  expect(calls).toHaveLength(1);
  expect(sock.once).toHaveBeenCalledWith('connect', expect.any(Function));
  sock.connected = true;
  onceHandlers.connect();
  expect(calls).toHaveLength(2);
  expect(calls[1].data.cid).toBe(calls[0].data.cid);
});

test('three misses → "not sent" line with the text, no fourth try', () => {
  loadRoom();
  send('hello');
  calls[0].cb(new Error('t'));
  calls[1].cb(new Error('t'));
  calls[2].cb(new Error('t'));
  expect(calls).toHaveLength(3);
  expect(window.ChatUI.appendSystemMessage).toHaveBeenCalledWith('⚠ room.chat_not_sent:hello');
});

test('two separate messages get different cids', () => {
  loadRoom();
  send('a');
  send('b');
  expect(calls[0].data.cid).not.toBe(calls[1].data.cid);
});
