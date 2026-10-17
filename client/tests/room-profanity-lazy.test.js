/**
 * #264 — room.html no longer loads profanity-filter.js at startup; room.js injects it on the first
 * chat-input focus. The client pass is cosmetic (server ChatHandler filters what others receive).
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/room.html?id=%23ABC"}
 */
'use strict';
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
const BODY_HTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
// #265: the injected URL carries profanity-filter.js's own content hash (what scripts/cache-bust.js writes).
const FILTER_V = require('crypto').createHash('sha256')
  .update(fs.readFileSync(path.join(__dirname, '..', 'js', 'profanity-filter.js'), 'utf8')).digest('hex').slice(0, 8);

function loadRoom() {
  jest.resetModules();
  document.head.innerHTML = '';
  document.body.innerHTML = BODY_HTML;
  delete window.ProfanityFilter;
  window.GvnSession = { requireAuth: jest.fn(), getUser: jest.fn(() => ({ userId: 'u-1', displayName: 'T', isGuest: false })) };
  window.t = jest.fn((k) => k);
  window.requestAnimationFrame = jest.fn((cb) => cb());
  window.SocketClient = class { constructor() { this.emit = jest.fn(); } on() {} bindStatusBanner() {} };
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  window.RoomState = { mySlot: null, roomData: { users: [] }, gameState: null };
  require('../js/room.js');
}
const filterScripts = () => [...document.querySelectorAll('script[src*="profanity-filter.js"]')];
const input = () => document.getElementById('chat-input');
const enter = () => input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

test('room.html has no startup <script> for the profanity filter', () => {
  expect(html).not.toMatch(/<script[^>]+profanity-filter\.js/);
});

test('nothing is injected until the chat input is focused', () => {
  loadRoom();
  expect(filterScripts()).toHaveLength(0);
});

test('first focus injects one script with the page ?v=; later focuses add none', () => {
  loadRoom();
  input().dispatchEvent(new Event('focus'));
  input().dispatchEvent(new Event('focus'));
  const s = filterScripts();
  expect(s).toHaveLength(1);
  expect(s[0].getAttribute('src')).toBe(`/js/profanity-filter.js?v=${FILTER_V}`);
});

test('no injection when the filter is already present', () => {
  loadRoom();
  window.ProfanityFilter = { filterMessage: (x) => x };
  input().dispatchEvent(new Event('focus'));
  expect(filterScripts()).toHaveLength(0);
});

test('sending before the filter arrives emits the raw text', () => {
  loadRoom();
  input().value = 'hello';
  enter();
  expect(window.RoomClient.emit).toHaveBeenCalledWith('chat:message', { text: 'hello' });
});

test('sending after the filter arrives emits the filtered text', () => {
  loadRoom();
  window.ProfanityFilter = { filterMessage: (x) => x.replace('bad', '***') };
  input().value = 'bad word';
  enter();
  expect(window.RoomClient.emit).toHaveBeenCalledWith('chat:message', { text: '*** word' });
});
