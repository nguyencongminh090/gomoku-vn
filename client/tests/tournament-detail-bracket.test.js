/**
 * Standings tab bracket views: Double Elimination tree + Swiss round columns.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/tournament.html?id=t1"}
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { generateBracket } = require('../../server/managers/tournament/pairing/doubleElim');

const BODY_HTML = fs.readFileSync(path.join(__dirname, '..', 'tournament.html'), 'utf8').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
let sock;

function setup() {
  document.body.innerHTML = BODY_HTML;
  window.GvnSession = { requireAuth: jest.fn(), getUser: jest.fn(() => ({ userId: 'u2', displayName: 'X', isGuest: false })) };
  window.t = jest.fn((key, p) => (p ? `${key}:${Object.values(p).join(',')}` : key));
  window.EscapeUtils = { escapeAttr: (s) => String(s).replace(/"/g, '&quot;') };
  window.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ games: [], pagination: {} }) }));
  window.SocketClient = class {
    constructor() { this._h = {}; sock = this; }
    emit() {}
    on(ev, cb) { (this._h[ev] = this._h[ev] || []).push(cb); }
    bindStatusBanner() {}
    trigger(ev, p) { (this._h[ev] || []).forEach((cb) => cb(p)); }
  };
  jest.resetModules();
  require('../js/tournament-detail.js');
}

const entries = [1, 2, 3, 4].map((n) => ({ entryId: `e${n}`, userId: `u${n}`, displayName: `P${n}`, isGuest: false, seed: n, finalRank: null, withdrawn: false }));
const pairing = (id, matchId, a, b, winner, extra = {}) => ({
  pairingId: id, bracketMatchId: matchId, roundIndex: extra.roundIndex ?? null, player1EntryId: a, player2EntryId: b,
  state: winner ? 'Completed' : 'Pending', result: winner ? { winnerEntryId: winner, reason: 'win' } : null,
  seriesScore: winner ? { [a]: winner === a ? 1 : 0, [b]: winner === b ? 1 : 0 } : null, pairedAt: '2026-01-01T00:00:00Z',
});
const base = (format, extra) => ({ tournamentId: 't1', name: 'T', format, organizerId: 'u1', organizerName: 'P1', ruleSet: {}, status: 'active', entries, ...extra });

describe('bracket views in the Standings tab', () => {
  test('double elim draws the full skeleton: played match shows names + winner, future match shows placeholders', () => {
    setup();
    const bracket = generateBracket(['e1', 'e2', 'e3', 'e4']);
    const w1m1 = bracket.winners[0][0];
    const [a, b] = [w1m1.slotA.seed, w1m1.slotB.seed].map((s) => bracket.playersBySeed[s - 1]);
    sock.trigger('tournament:detail', {
      tournament: base('double_elim', { bracket }),
      pairings: [pairing('p1', 'W1M1', a, b, a)],
    });
    const html = document.getElementById('standings-container').innerHTML;
    expect(document.querySelectorAll('.bm').length).toBeGreaterThanOrEqual(5);
    expect(document.querySelector('.bm__row.is-winner').dataset.entry).toBe(a);
    expect(html).toContain('tdetail.bracket_winner_of:2'); // match 2 not played yet; labels are numbers, not engine ids
    expect(document.querySelector('[data-entry="e1"].bm__row:not(.is-winner)')).not.toBeNull(); // winner advanced into W2M1
    expect(html).toContain('tdetail.bracket_loser_of');
    expect(html).toContain('tdetail.bracket_grand_final');
  });

  test('completed tournament shows champion and runner-up from finalRank', () => {
    setup();
    const bracket = generateBracket(['e1', 'e2', 'e3', 'e4']);
    const ents = entries.map((e, i) => ({ ...e, finalRank: i < 2 ? i + 1 : 3 }));
    sock.trigger('tournament:detail', { tournament: base('double_elim', { bracket, status: 'completed', entries: ents }), pairings: [] });
    const items = [...document.querySelectorAll('.podium__item')].map((el) => el.className + ':' + el.querySelector('strong').textContent);
    expect(items).toEqual(['podium__item podium__item--champion:P1', 'podium__item podium__item--runner-up:P2']);
  });

  test('double elim in draft shows the not-started notice, no cards', () => {
    setup();
    sock.trigger('tournament:detail', { tournament: base('double_elim', { status: 'draft', bracket: null }), pairings: [] });
    expect(document.querySelectorAll('.bm').length).toBe(0);
    expect(document.getElementById('standings-container').textContent).toContain('tdetail.bracket_not_started');
  });

  test('swiss renders one column per round plus the ranked table', () => {
    setup();
    sock.trigger('tournament:detail', {
      tournament: base('swiss', { currentRoundIndex: 2, totalRounds: 3 }),
      pairings: [
        pairing('pa1', null, 'e1', 'e2', 'e1', { roundIndex: 1 }),
        pairing('pa2', null, 'e3', 'e4', 'e4', { roundIndex: 1 }),
        pairing('pb1', null, 'e1', 'e4', null, { roundIndex: 2 }),
      ],
    });
    expect(document.querySelectorAll('.bracket--swiss .bracket__col').length).toBe(2);
    expect(document.querySelectorAll('.bracket--swiss .bm').length).toBe(3);
    expect(document.querySelector('.standings-table')).not.toBeNull();
    // newest round first, like the Pairings tab
    expect([...document.querySelectorAll('.bracket--swiss .bracket__col-title')].map((e) => e.textContent)).toEqual(['tdetail.round_word 2', 'tdetail.round_word 1']);
  });

  test('cards with two players are keyboard-focusable links carrying their pairing id; byes are not', () => {
    setup();
    sock.trigger('tournament:detail', {
      tournament: base('swiss', { currentRoundIndex: 1, totalRounds: 3 }),
      pairings: [pairing('pa1', null, 'e1', 'e2', 'e1', { roundIndex: 1 }), { ...pairing('pa2', null, 'e3', null, 'e3', { roundIndex: 1 }), player2EntryId: null }],
    });
    const cards = [...document.querySelectorAll('.bm')];
    expect(cards.filter((c) => c.dataset.pairing).map((c) => c.dataset.pairing)).toEqual(['pa1']);
    expect(cards.find((c) => c.dataset.pairing).getAttribute('tabindex')).toBe('0');
  });
});
