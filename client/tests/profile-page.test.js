/**
 * TODO.md #177 — profile page: renders as text, privacy states, owner-only edit panel.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/u/alice"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BODY_HTML = fs.readFileSync(path.join(__dirname, '..', 'profile.html'), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');

const PROFILE = {
  username: 'alice', displayName: '<img src=x onerror=alert(1)>', createdAt: '2026-03-01T00:00:00.000Z',
  avatarUrl: null, bio: 'hi <b>there</b>',
  ratings: [{ category: 'caro', rating: 1650, rank: 7, games: 40, provisional: false, delta7: 14 }],
  stats: { games: 10, wins: 6, draws: 1 },
  recent: [{ id: 'g1', opponent: 'bob', result: 'win', endedAt: '2026-10-01T00:00:00.000Z' }],
  isSelf: false,
};

let HISTORY = { hidden: false, points: [{ t: 'a', rating: 1500 }, { t: 'b', rating: 1580 }, { t: 'c', rating: 1650 }], peak: 1700 };
const flush = () => new Promise((r) => setTimeout(r, 0));

async function boot(profile, status = 200) {
  jest.resetModules();
  document.body.innerHTML = BODY_HTML;
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  global.fetch = jest.fn((url) => (String(url).includes('/rating-history')
    ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(HISTORY) })
    : Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(profile) })));
  require('../js/platform-shell.js');
  require('../js/profile.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush(); await flush();
}

describe('profile page', () => {
  beforeEach(() => { HISTORY = { hidden: false, points: [{ t: 'a', rating: 1500 }, { t: 'b', rating: 1580 }, { t: 'c', rating: 1650 }], peak: 1700 }; });

  it('card shows the weekly change; chart plots the curve with the all-time peak', async () => {
    await boot(PROFILE);
    expect(document.querySelector('.pcard small.up').textContent).toBe('profile.delta_week{"n":"+14"}');
    expect(global.fetch.mock.calls.some((c) => c[0] === '/api/profile/alice/rating-history?category=caro&days=90')).toBe(true);
    const svg = document.getElementById('pf-chart');
    expect(svg.hasAttribute('hidden')).toBe(false);
    expect(svg.querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(3);
    expect(document.getElementById('pf-chart-note').textContent).toContain('1700');
  });

  it('hidden history → no weekly change, no chart, explanatory note', async () => {
    HISTORY = { hidden: true, points: [], peak: null };
    await boot({ ...PROFILE, ratings: [{ ...PROFILE.ratings[0], delta7: null }] });
    expect(document.querySelector('.pcard small.up, .pcard small.dn')).toBeNull();
    expect(document.getElementById('pf-chart').hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('pf-chart-note').textContent).toBe('profile.chart_hidden');
  });

  it('one data point is not a curve → empty note', async () => {
    HISTORY = { hidden: false, points: [{ t: 'a', rating: 1500 }], peak: 1500 };
    await boot(PROFILE);
    expect(document.getElementById('pf-chart').hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('pf-chart-note').textContent).toContain('profile.chart_empty');
  });

  it('renders user text as text, requests the path username', async () => {
    await boot(PROFILE);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/profile/alice');
    expect(document.getElementById('pf-name').textContent).toBe(PROFILE.displayName);
    expect(document.querySelector('#pf-name img')).toBeNull();
    expect(document.getElementById('pf-bio').querySelector('b')).toBeNull();
    expect(document.querySelectorAll('.pcard')).toHaveLength(1);
    expect(document.querySelectorAll('#pf-recent .prow')).toHaveLength(1);
    expect(document.getElementById('pf-edit').hidden).toBe(true);
    expect(document.getElementById('pf-actions').hidden).toBe(true);
  });

  it('shows the history-private note when stats are withheld', async () => {
    await boot({ ...PROFILE, stats: null, recent: [], bio: null });
    expect(document.getElementById('pf-recent-note').textContent).toBe('profile.history_hidden');
    expect(document.getElementById('pf-stats').children).toHaveLength(0);
  });

  it('shows the edit panel only for the owner, prefilled', async () => {
    await boot({ ...PROFILE, isSelf: true, privacy: { hideHistory: true, hideBio: false } });
    expect(document.getElementById('pf-edit').hidden).toBe(false);
    expect(document.getElementById('pf-bio-input').value).toBe('hi <b>there</b>');
    expect(document.getElementById('pf-hide-history').checked).toBe(true);
  });

  it('shows a not-found message', async () => {
    await boot(null, 404);
    expect(document.getElementById('pf-status').textContent).toBe('profile.not_found');
    expect(document.getElementById('pf-content').hidden).toBe(true);
  });
});
