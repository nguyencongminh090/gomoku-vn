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
  it('network: a dense 120-node graph settles with no overlapping circles', async () => {
    const nodes = Array.from({ length: 120 }, (_, i) => N('n' + i, i % 8, 5 + (i % 30), 1500));
    const edges = [];
    for (let i = 0; i < 120; i++) for (let j = i + 1; j < 120; j += 7) edges.push({ a: 'n' + i, b: 'n' + j, games: 1 + ((i + j) % 9) });
    await boot(() => ok({ ...DATA, viz: { ...VIZ, total: 120, shown: 120, communities: 8, nodes, edges } }));
    document.querySelectorAll('.ri-seg button')[1].click(); // default view is suspect-first; "All" restores the 120
    const c = [...document.querySelectorAll('.ri-svg--graph circle.ri-node')].map((e) => ({ x: +e.getAttribute('cx'), y: +e.getAttribute('cy'), r: +e.getAttribute('r'), k: e.getAttribute('class') }));
    expect(c).toHaveLength(120);
    let minGap = Infinity;
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) minGap = Math.min(minGap, Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y) - c[i].r - c[j].r);
    expect(minGap).toBeGreaterThanOrEqual(0); // collision pass guarantees circles never touch (was 449 overlapping pairs)
  });
  it('network: zoom buttons narrow the viewBox, 1:1 restores it, and zoom stops at 6x', async () => {
    await boot(() => ok({ ...DATA, viz: VIZ }));
    const g = document.querySelector('.ri-svg--graph');
    const [out, inn, one] = document.querySelectorAll('.ri-zoom button');
    const vb = () => g.getAttribute('viewBox').split(' ').map(Number);
    const w0 = vb()[2];
    out.click();
    expect(vb()[2]).toBe(w0); // already fully zoomed out
    inn.click();
    expect(vb()[2]).toBeLessThan(w0);
    for (let i = 0; i < 20; i++) inn.click();
    expect(vb()[2]).toBeCloseTo(w0 / 6, 5);
    one.click();
    expect(vb()).toEqual([0, 0, w0, vb()[3]]);
    expect(inn.getAttribute('aria-label')).toBe('admin.i_viz_zoom_in');
  });

  describe('declutter (#353)', () => {
    // flagged f1,f2 in group 0 with weak/strong links; group 1 has 4 players; 7 lone communities fold into "other"
    const mk = (id, community, games = 10) => N(id, community, games, 1500);
    const nodes = [mk('f1', 0, 30), mk('f2', 0, 25), mk('o1', 0), mk('o2', 0), mk('o3', 0), mk('q1', 1), mk('q2', 1), mk('q3', 1), mk('q4', 1),
      ...[5, 6, 7].map((c) => mk('s' + c, c))];
    const edges = [{ a: 'f1', b: 'f2', games: 20 }, { a: 'f1', b: 'o1', games: 6 }, { a: 'f1', b: 'o2', games: 4 }, { a: 'f1', b: 'o3', games: 1 },
      { a: 'f2', b: 'q1', games: 3 }, { a: 'q1', b: 'q2', games: 5 }, { a: 'q2', b: 'q3', games: 5 }, { a: 'q3', b: 'q4', games: 5 }, { a: 'q4', b: 's5', games: 2 }];
    const V = { total: 40, shown: nodes.length, communities: 5, nodes, edges, flagged: ['f1', 'f2'], ratingBins: [], gamesBins: [] };
    const st = (o = {}) => ({ scope: 'suspect', level: 'players', focus: null, min: 2, cross: false, ...o });
    const ids = (v) => v.nodes.map((n) => n.id).sort();
    beforeEach(() => { window.t = (k, v) => k + (v ? JSON.stringify(v) : ''); require('../js/admin-integrity-viz.js'); });

    it('suspect scope = flagged + their top 2 opponents; "all" shows every node', () => {
      const b = window.IntegrityViz.buildView;
      expect(ids(b(V, st()))).toEqual(['f1', 'f2', 'o1', 'q1']); // f1's top 2 = f2, o1 (o2 is 3rd); f2's top 2 = f1, q1
      expect(b(V, st({ scope: 'all' })).nodes).toHaveLength(nodes.length);
    });
    it('edge filter hides weak edges and optionally in-group edges', () => {
      const b = window.IntegrityViz.buildView;
      const all = (o) => b(V, st({ scope: 'all', ...o })).edges;
      expect(all({ min: 1 })).toHaveLength(edges.length);
      expect(all({ min: 5 }).every((e) => e.games >= 5)).toBe(true);
      expect(all({ min: 1, cross: true }).map((e) => e.a + e.b).sort()).toEqual(['f2q1', 'q4s5']);
    });
    it('group level: one bubble per community, groups past the palette fold into one, edges are summed', () => {
      const v = window.IntegrityViz.buildView(V, st({ scope: 'all', level: 'groups', min: 1 }));
      expect(v.nodes.every((n) => n.bubble)).toBe(true);
      expect(v.nodes.map((n) => n.community).sort()).toEqual([0, 1, 5]);
      expect(v.nodes.find((n) => n.community === 5)).toMatchObject({ members: 3 });
      expect(v.edges.find((e) => e.a === 'g0' && e.b === 'g1').games).toBe(3);
    });
    it('focus keeps one group as players and folds the rest into bubbles', () => {
      const v = window.IntegrityViz.buildView(V, st({ scope: 'all', focus: 1, min: 1 }));
      expect(v.nodes.filter((n) => !n.bubble).map((n) => n.id).sort()).toEqual(['q1', 'q2', 'q3', 'q4']);
      expect(v.nodes.filter((n) => n.bubble).map((n) => n.community).sort()).toEqual([0, 5]);
    });
    it('no flags → falls back to the most active players, never an empty graph', () => {
      expect(window.IntegrityViz.buildView({ ...V, flagged: [] }, st()).nodes.length).toBeGreaterThan(0);
    });
    it('UI: default is the suspect view; clicking a bubble opens its group; click pins; search pans to a player', async () => {
      await boot(() => ok({ ...DATA, viz: V }));
      const g = () => document.querySelector('.ri-svg--graph');
      expect(g().querySelectorAll('circle.ri-node')).toHaveLength(4);
      const btns = document.querySelectorAll('.ri-seg button');
      btns[1].click(); // All
      expect(g().querySelectorAll('circle.ri-node')).toHaveLength(nodes.length);
      btns[3].click(); // by group
      const bubbles = g().querySelectorAll('circle.ri-node--bubble');
      expect(bubbles).toHaveLength(3);
      bubbles[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(g().querySelectorAll('circle.ri-node:not(.ri-node--bubble)')).toHaveLength(4);
      const c = g().querySelector('circle.ri-node:not(.ri-node--bubble)');
      c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      c.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
      expect(document.querySelector('.ri-readout').textContent).toContain('Q'); // pinned: readout survives leaving
      const input = document.querySelector('.ri-search');
      input.value = 'f2';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(+g().getAttribute('viewBox').split(' ')[2]).toBeLessThan(1100);
      expect(document.querySelector('.ri-readout').textContent).toContain('F2');
    });
  });
});
