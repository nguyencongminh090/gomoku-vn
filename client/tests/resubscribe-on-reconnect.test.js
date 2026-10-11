/**
 * B228 — lobby.js / tournaments.js re-emit their subscribes after a socket reconnect
 * (a reconnect is a new server socket in no rooms). Not on the first connect (no doubling).
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const BODY = read('index.html').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const strip = (s) => s.replace(/^export (const|function) /gm, '$1 ');
const LOBBY = strip(read('js/lobby.js'));
const TOURN = read('js/tournaments.js').replace(/^import [^\n]*lobby\.js[^\n]*\n/m, 'const { client, setHeroTournamentCount } = window.__stub;\n');

function fakeClient() {
  const handlers = {};
  return {
    emitted: [],
    on(ev, fn) { handlers[ev] = fn; },
    emit(ev) { this.emitted.push(ev); },
    fire(ev, d) { handlers[ev] && handlers[ev](d); },
    bindStatusBanner() {},
  };
}

beforeEach(() => {
  document.body.innerHTML = BODY;
  window.t = (k) => k;
  window.EscapeUtils = require('../js/escape-utils.js');
  window.GvnSession = { getUser: () => null, requireAuth: () => true };
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
});

it('lobby.js: no longer subscribes by itself (B229 — lobby-home.js owns it, rooms screen only)', () => {
  const c = fakeClient();
  window.SocketClient = { shared: () => c };
  window.eval(LOBBY);
  c.fire('disconnect');
  c.fire('connect');
  expect(c.emitted.filter((e) => e === 'lobby:subscribe')).toHaveLength(0);
});

it('tournaments.js: both subscribes repeat after disconnect → connect only', () => {
  const c = fakeClient();
  window.__stub = { client: c, setHeroTournamentCount: jest.fn() };
  window.eval(TOURN);
  const n = (ev) => c.emitted.filter((e) => e === ev).length;
  expect([n('tournament:subscribe'), n('live_matches:subscribe')]).toEqual([1, 1]);
  c.fire('connect');
  expect([n('tournament:subscribe'), n('live_matches:subscribe')]).toEqual([1, 1]);
  c.fire('disconnect');
  c.fire('connect');
  expect([n('tournament:subscribe'), n('live_matches:subscribe')]).toEqual([2, 2]);
});
