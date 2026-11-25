/**
 * B460 — Club team tournament detail page: captain roster selector, rating-ordered
 * board preview, live team standings on pairing patch, and shared #1 ties.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/tournament.html?id=team-t1"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BODY_HTML = fs.readFileSync(path.join(__dirname, '..', 'tournament.html'), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
const flush = () => new Promise((r) => setTimeout(r, 0));

let sock;

function setup({ user = { userId: 'u_cap', displayName: 'Captain', isGuest: false }, fetchImpl } = {}) {
  document.body.innerHTML = BODY_HTML;
  window.GvnSession = { requireAuth: jest.fn(), getUser: jest.fn(() => user) };
  window.t = jest.fn((key, p) => (p ? `${key}:${Object.values(p).join(',')}` : key));
  window.EscapeUtils = require('../js/escape-utils.js');
  require('../js/platform-shell.js');
  window.fetch = fetchImpl || jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ clubs: [] }) }));
  window.SocketClient = class {
    constructor() { this._h = {}; this.emitted = []; sock = this; }
    emit(ev, payload) { this.emitted.push([ev, payload]); }
    on(ev, cb) { (this._h[ev] = this._h[ev] || []).push(cb); }
    bindStatusBanner() {}
    trigger(ev, p) { (this._h[ev] || []).forEach((cb) => cb(p)); }
  };
  jest.resetModules();
  require('../js/tournament-detail.js');
}

describe('B460 — tournament-detail team tournament UI', () => {
  it('renders captain roster selector in draft, previews rating+username board order, and emits tournament:register_team', async () => {
    const fetchMock = jest.fn((url) => {
      if (url === '/api/clubs/mine') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ clubs: [{ slug: 'clb-hn', name: 'CLB Hà Nội', role: 'owner', tag: 'HN', color: 'blue' }] }),
        });
      }
      if (url.startsWith('/api/clubs/clb-hn')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            leaderboard: [
              { username: 'zara', displayName: 'Zara', rating: 1500 },
              { username: 'anh', displayName: 'Anh', rating: 1500 },
              { username: 'top', displayName: 'Top', rating: 1700 },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    setup({ fetchImpl: fetchMock });
    sock.trigger('tournament:detail', {
      tournament: {
        tournamentId: 'team-t1',
        name: 'Đại chiến CLB',
        format: 'team',
        organizerId: 'u_cap',
        organizerName: 'Captain',
        ruleSet: { winningRule: 'freestyle', boardCount: 2, teamRounds: 2 },
        status: 'draft',
        entries: [],
        teams: [],
      },
      pairings: [],
    });
    await flush();
    await flush();

    const boxes = [...document.querySelectorAll('#team-member-list input[type="checkbox"]')];
    expect(boxes).toHaveLength(3);
    expect(document.getElementById('btn-submit-team-roster').disabled).toBe(true);

    // Pick zara (1500) and anh (1500) -> preview orders Anh (Bàn 1) before Zara (Bàn 2) by username!
    document.querySelector('#team-member-list input[value="zara"]').click();
    document.querySelector('#team-member-list input[value="anh"]').click();
    const previewNames = [...document.querySelectorAll('#team-board-preview .team-roster-row__name')].map((n) => n.textContent);
    expect(previewNames).toEqual(['Anh', 'Zara']);
    expect(document.getElementById('btn-submit-team-roster').disabled).toBe(false);

    document.getElementById('btn-submit-team-roster').click();
    expect(sock.emitted).toContainEqual(['tournament:register_team', {
      tournamentId: 'team-t1',
      clubSlug: 'clb-hn',
      usernames: ['zara', 'anh'],
    }]);
  });

  it('updates live team scoreboard and standings on pairings_patch and renders Đồng hạng nhất on equal totals', async () => {
    setup();
    const entries = [
      { entryId: 'a1', userId: 'ua1', displayName: 'A1', teamId: 'tm1', boardNumber: 1, withdrawn: false },
      { entryId: 'a2', userId: 'ua2', displayName: 'A2', teamId: 'tm1', boardNumber: 2, withdrawn: false },
      { entryId: 'b1', userId: 'ub1', displayName: 'B1', teamId: 'tm2', boardNumber: 1, withdrawn: false },
      { entryId: 'b2', userId: 'ub2', displayName: 'B2', teamId: 'tm2', boardNumber: 2, withdrawn: false },
    ];
    const teams = [
      {
        teamId: 'tm1', teamOrder: 1, clubSlug: 'hn', clubName: 'CLB Hà Nội', clubTag: 'HN', clubColor: 'blue',
        roster: [
          { entryId: 'a1', userId: 'ua1', displayName: 'A1', boardNumber: 1 },
          { entryId: 'a2', userId: 'ua2', displayName: 'A2', boardNumber: 2 },
        ],
      },
      {
        teamId: 'tm2', teamOrder: 2, clubSlug: 'sg', clubName: 'CLB Sài Gòn', clubTag: 'SG', clubColor: 'orange',
        roster: [
          { entryId: 'b1', userId: 'ub1', displayName: 'B1', boardNumber: 1 },
          { entryId: 'b2', userId: 'ub2', displayName: 'B2', boardNumber: 2 },
        ],
      },
    ];
    sock.trigger('tournament:detail', {
      tournament: {
        tournamentId: 'team-t1', name: 'Giao hữu', format: 'team', organizerId: 'u_org', organizerName: 'Org',
        ruleSet: { boardCount: 2, teamRounds: 1 }, status: 'active', currentRoundIndex: 1, totalRounds: 1,
        entries, teams,
      },
      pairings: [
        { pairingId: 'p1', roundIndex: 1, boardNumber: 1, player1EntryId: 'a1', player2EntryId: 'b1', state: 'Negotiating', readyPlayers: [], pairedAt: '2026-11-25T01:00:00Z' },
        { pairingId: 'p2', roundIndex: 1, boardNumber: 2, player1EntryId: 'b2', player2EntryId: 'a2', state: 'Negotiating', readyPlayers: [], pairedAt: '2026-11-25T01:00:00Z' },
      ],
    });
    await flush();

    expect(document.querySelector('.pairing-card__board').textContent).toBe('Bàn 1');
    expect(document.getElementById('team-scoreboard').textContent).not.toContain('·');

    // Complete both boards 1-0 and 0-1 -> tied 1 : 1
    sock.trigger('tournament:pairings_patch', {
      tournamentId: 'team-t1',
      pairings: [
        { pairingId: 'p1', roundIndex: 1, boardNumber: 1, player1EntryId: 'a1', player2EntryId: 'b1', state: 'Completed', result: { winnerEntryId: 'a1', reason: 'normal' }, readyPlayers: [], pairedAt: '2026-11-25T01:00:00Z' },
        { pairingId: 'p2', roundIndex: 1, boardNumber: 2, player1EntryId: 'b2', player2EntryId: 'a2', state: 'Walkover', result: { winnerEntryId: 'b2', reason: 'walkover' }, readyPlayers: [], pairedAt: '2026-11-25T01:00:00Z' },
      ],
    });
    sock.trigger('tournament:updated', {
      tournamentId: 'team-t1',
      status: 'completed',
      teams: teams.map((tm) => ({ ...tm, finalRank: 1 })),
    });

    const ranks = [...document.querySelectorAll('#team-standings-table .rank-cell')].map((c) => c.textContent.trim());
    expect(ranks).toEqual(['1', '1']);
    expect(document.getElementById('team-standings-table').textContent).toContain('Đồng hạng nhất');
  });
});
