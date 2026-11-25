/**
 * TODO.md #472 — after a server restart the match page kept the aborted game
 * live: tmatch:subscribe was emitted once at module load and never again, so
 * on reconnect the server (which hydrated the pairing back to Ready, no live
 * match) was never asked and never answered NO_ACTIVE_MATCH.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/tournament-match.html?tournamentId=t1&pairingId=p1"}
 */
'use strict';
const fs = require('fs');
const path = require('path');

const BODY_HTML = fs.readFileSync(path.join(__dirname, '..', 'tournament-match.html'), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];

let sc;
function setup() {
  document.body.innerHTML = BODY_HTML;
  window.GvnSession = { requireAuth: jest.fn(), getUser: jest.fn(() => ({ userId: 'u1', displayName: 'U', isGuest: false })) };
  window.t = jest.fn((k) => k);
  window.requestAnimationFrame = jest.fn();
  window.BoardRenderer = class { setState() {} resize() {} };
  window.alert = jest.fn();
  window.SocketClient = class {
    constructor() { this._h = {}; this._r = []; this.emitted = []; sc = this; }
    emit(ev, data) { this.emitted.push([ev, data]); }
    on(ev, cb) { (this._h[ev] = this._h[ev] || []).push(cb); }
    onReconnect(cb) { this._r.push(cb); }
    bindStatusBanner() {}
    reconnect() { this._r.forEach((cb) => cb()); }
    trigger(ev, p) { (this._h[ev] || []).forEach((cb) => cb(p)); }
  };
  jest.resetModules();
  require('../js/tournament-match.js');
}

const subs = () => sc.emitted.filter(([ev]) => ev === 'tmatch:subscribe');

test('re-subscribes to the pairing on every socket reconnect', () => {
  setup();
  expect(subs()).toHaveLength(1);
  sc.reconnect();
  expect(subs()).toHaveLength(2);
  expect(subs()[1][1]).toEqual({ tournamentId: 't1', pairingId: 'p1' });
});

test('NO_ACTIVE_MATCH after reconnect tells the player and leaves the match page', () => {
  setup();
  sc.reconnect();
  sc.trigger('tmatch:error', { code: 'NO_ACTIVE_MATCH' });
  expect(window.alert).toHaveBeenCalledWith('err.no_active_match');
});
