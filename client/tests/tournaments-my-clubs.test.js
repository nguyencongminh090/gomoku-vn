/**
 * B210 — lobby tournament list: the "Của CLB" tab (tournaments hosted by a club the viewer belongs to)
 * and the club name on cards. js/tournaments.js is an ES module; the lobby.js import is swapped for a stub.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const BODY = read('index.html').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const SRC = read('js/tournaments.js').replace(/^import [^\n]*lobby\.js[^\n]*\n/m, 'const { client, setHeroTournamentCount } = window.__lobbyStub;\n');

const T = (id, o = {}) => ({ tournamentId: id, name: 'Cup ' + id, format: 'swiss', organizerId: 'o', organizerName: 'Org', playerCount: 2, status: 'draft', entryUserIds: [], clubSlug: null, clubName: null, ...o });
const LIST = [
  T('a', { clubSlug: 'hn', clubName: 'CLB <i>HN</i>' }),
  T('b', { clubSlug: 'sg', clubName: 'CLB SG', status: 'active' }),
  T('c'),
];
const flush = () => new Promise((r) => setTimeout(r, 0));
const cards = () => [...document.querySelectorAll('.tournament-card')].map((c) => c.dataset.tournamentId);
const pill = () => document.getElementById('filter-my-clubs');

async function boot({ user = { userId: 'u', isGuest: false, displayName: 'Z' }, clubs = [{ slug: 'hn', name: 'HN' }], clubsOk = true } = {}) {
  document.body.innerHTML = BODY;
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  window.EscapeUtils = require('../js/escape-utils.js');
  window.GvnSession = { getUser: () => user };
  const handlers = {};
  window.__lobbyStub = { setHeroTournamentCount: jest.fn(), client: { on: (ev, fn) => { handlers[ev] = fn; }, emit: jest.fn() } };
  global.fetch = jest.fn(() => Promise.resolve({ ok: clubsOk, json: () => Promise.resolve({ clubs }) }));
  window.eval(SRC);
  handlers['tournament:list']({ tournaments: LIST });
  await flush(); await flush();
}

describe('"Của CLB" tournaments tab', () => {
  it('hidden until the viewer is known to belong to a club; shows only tournaments hosted by those clubs', async () => {
    await boot();
    expect(global.fetch).toHaveBeenCalledWith('/api/clubs/mine', expect.anything());
    expect(pill().hidden).toBe(false);
    pill().click();
    expect(cards()).toEqual(['a']);
    expect(pill().classList.contains('is-active')).toBe(true);
    document.querySelector('.filter-pill[data-filter="all"]').click();
    expect(cards()).toEqual(['a', 'b', 'c']);
  });

  it('stays hidden for club-less members and guests, signed-out (no request) and on a failed request', async () => {
    await boot({ clubs: [] });
    expect(pill().hidden).toBe(true);
    await boot({ user: { userId: 'g', isGuest: true, displayName: 'G' }, clubs: [] }); // /api/clubs/mine answers [] for a guest session
    expect(pill().hidden).toBe(true);
    await boot({ user: null });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(pill().hidden).toBe(true);
    await boot({ clubsOk: false });
    expect(pill().hidden).toBe(true);
  });

  it('cards name the hosting club as text (never markup)', async () => {
    await boot();
    const meta = document.querySelector('[data-tournament-id="a"] .tournament-card__meta');
    expect(meta.textContent).toContain('tournaments.club_suffix');
    expect(meta.querySelector('i')).toBeNull();
    expect(document.querySelector('[data-tournament-id="c"] .tournament-card__meta').textContent).not.toContain('club_suffix');
  });
});
