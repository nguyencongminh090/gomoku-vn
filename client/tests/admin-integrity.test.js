/**
 * TODO.md #249 — /admin "Toàn vẹn xếp hạng" tab renders the read-only signals.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/admin"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ADMIN = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const $ = (id) => document.getElementById(id);
const flush = () => new Promise((r) => setTimeout(r, 0));
const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });

const DATA = {
  population: 12, activePlayers: 12, thresholds: { POP_MIN: 10, MIN_GAMES: 10 },
  players: [{ userId: 'u', displayName: 'Boost', games: 12, uniqueOpponents: 1, effectiveOpponents: 1, topOpponentName: 'Feeder', topGainShare: 1, flags: ['narrow_opponents', 'gain_from_one'], topOpponentFriend: true, topOpponentSameClub: false }],
  pairs: [{ aName: 'Boost', bName: 'Feeder', games: 12, aWins: 12, bWins: 0, friends: true, sameClub: false }],
  groups: [],
};

function boot(fetchImpl) {
  jest.resetModules();
  document.body.innerHTML = ADMIN;
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  global.fetch = jest.fn(fetchImpl);
  require('../js/admin-integrity.js');
  window.AdminIntegrity.init();
  return flush();
}

it('renders players, pairs and an empty groups section with friend context', async () => {
  await boot(() => ok(DATA));
  expect(global.fetch).toHaveBeenCalledWith('/api/admin/rating-integrity', { credentials: 'same-origin' });
  const text = $('ri-list').textContent;
  expect(text).toContain('Boost');
  expect(text).toContain('admin.i_flag_gain_from_one');
  expect(text).toContain('admin.i_friends');
  expect(text).toContain('admin.i_pair');
  expect(text).toContain('admin.i_empty');
  expect($('ri-msg').hidden).toBe(true);
});

it('shows the localized error on 403', async () => {
  await boot(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({ code: 'CHEAT_FORBIDDEN' }) }));
  expect($('ri-msg').hidden).toBe(false);
  expect($('ri-msg').textContent).toBe('err.cheat_forbidden');
});
