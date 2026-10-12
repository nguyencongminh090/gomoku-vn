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
  require('../js/admin-integrity-viz.js');
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

describe('charts', () => {
  const N = (id, community, games, rating) => ({ id, name: id.toUpperCase(), community, games, rating, opponents: 2, communitySize: 2 });
  const VIZ = {
    total: 4, shown: 4, communities: 7,
    nodes: [N('a', 0, 12, 1520), N('b', 0, 30, 1480), N('c', 1, 5, 1500), N('x', 6, 1, 1500)],
    edges: [{ a: 'a', b: 'b', games: 9 }, { a: 'b', b: 'c', games: 2 }],
    ratingBins: [{ from: 1400, to: 1499, count: 1 }, { from: 1500, to: 1599, count: 3 }],
    gamesBins: [{ from: 1, to: 4, count: 1 }, { from: 5, to: 9, count: 1 }, { from: 50, to: null, count: 0 }],
  };
  it('draws network, scatter and two histograms with tooltips; communities beyond the palette fold into "other"', async () => {
    await boot(() => ok({ ...DATA, viz: VIZ }));
    const box = $('ri-viz');
    expect(box.hidden).toBe(false);
    expect(box.querySelectorAll('svg')).toHaveLength(4);
    expect(box.querySelectorAll('line.ri-edge')).toHaveLength(2);
    expect(box.querySelectorAll('circle.ri-node')).toHaveLength(8); // 4 in the network + 4 in the scatter
    expect(box.querySelectorAll('rect.ri-bar')).toHaveLength(5);
    expect(box.querySelectorAll('circle.viz-c-other')).toHaveLength(2);
    expect(box.querySelector('circle.ri-node title').textContent).toContain('A');
  });
  it('names stay text (no markup) and no viz → section hidden', async () => {
    await boot(() => ok({ ...DATA, viz: { ...VIZ, nodes: [N('a', 0, 12, 1520)].map((n) => ({ ...n, name: '<i>x</i>' })), edges: [] } }));
    expect($('ri-viz').querySelector('i, b i')).toBeNull();
    await boot(() => ok(DATA));
    expect($('ri-viz').hidden).toBe(true);
  });
  it('network: hover shows a readout and dims others; drag moves the node and release lets it go', async () => {
    await boot(() => ok({ ...DATA, viz: VIZ }));
    const g = document.querySelector('.ri-svg--graph');
    const circles = g.querySelectorAll('circle.ri-node');
    const ev = (type, x, y) => new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    circles[0].dispatchEvent(ev('pointerenter', 0, 0));
    expect(document.querySelector('.ri-readout').textContent).toContain('A');
    expect(circles[3].classList.contains('is-off')).toBe(true); // 'x' is not a neighbour of 'a'
    circles[0].dispatchEvent(ev('pointerleave', 0, 0));
    expect(circles[3].classList.contains('is-off')).toBe(false);
    circles[0].dispatchEvent(ev('pointerdown', 10, 10));
    circles[0].dispatchEvent(ev('pointermove', 200, 150));
    expect(+circles[0].getAttribute('cx')).toBe(200);
    expect(+circles[0].getAttribute('cy')).toBe(150);
    expect(circles[0].classList.contains('is-drag')).toBe(true);
    circles[0].dispatchEvent(ev('pointerup', 200, 150));
    expect(circles[0].classList.contains('is-drag')).toBe(false);
  });
});
