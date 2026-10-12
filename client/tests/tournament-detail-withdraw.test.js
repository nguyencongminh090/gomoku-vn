/**
 * B241 — tournament.html: withdraw / drop-player controls and the
 * "withdrawn" tag + walkover rendering for the new result reasons.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/tournament.html?id=t1"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BODY_HTML = (() => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'tournament.html'), 'utf8');
  return html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
})();

let sock;
let emitted;

function setup(sessionUserId) {
  document.body.innerHTML = BODY_HTML;
  window.GvnSession = {
    requireAuth: jest.fn(),
    getUser: jest.fn(() => ({ userId: sessionUserId, displayName: 'X', isGuest: false })),
  };
  window.t = jest.fn((key) => key);
  window.EscapeUtils = {
    escapeAttr: (s) => String(s).replace(/"/g, '&quot;'),
  };
  window.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ games: [], pagination: {} }) }));
  emitted = [];
  window.SocketClient = class {
    constructor() { this._h = {}; sock = this; }
    emit(ev, payload) { emitted.push([ev, payload]); }
    on(ev, cb) { (this._h[ev] = this._h[ev] || []).push(cb); }
    bindStatusBanner() {}
    trigger(ev, p) { (this._h[ev] || []).forEach((cb) => cb(p)); }
  };
  jest.resetModules();
  require('../js/tournament-detail.js');
}

const entry = (n, extra = {}) => ({ entryId: `e${n}`, userId: `u${n}`, displayName: `P${n}`, isGuest: false, seed: n, finalRank: null, withdrawn: false, ...extra });
function detail(entries, pairings = [], status = 'active') {
  return {
    tournament: { tournamentId: 't1', name: 'T', format: 'swiss', organizerId: 'u1', organizerName: 'P1', ruleSet: {}, status, entries, currentRoundIndex: 1, totalRounds: 2 },
    pairings,
  };
}
const slot = () => document.getElementById('detail-cancel-slot');

describe('tournament-detail.js withdraw / drop controls (B241)', () => {
  beforeEach(() => { window.confirm = jest.fn(() => true); });

  test('a player sees Withdraw, not Drop, and it emits tournament:withdraw without entryId', () => {
    setup('u2');
    sock.trigger('tournament:detail', detail([entry(1), entry(2), entry(3)]));
    expect(slot().querySelector('#drop-player-select')).toBeNull();
    slot().querySelector('#btn-withdraw').click();
    expect(emitted).toContainEqual(['tournament:withdraw', { tournamentId: 't1' }]);
  });

  test('the organizer gets a picker of non-withdrawn players and drops the chosen entry', () => {
    setup('u1');
    sock.trigger('tournament:detail', detail([entry(1), entry(2), entry(3, { withdrawn: true })]));
    const options = [...slot().querySelectorAll('#drop-player-select option')].map((o) => o.value);
    expect(options).toEqual(['e1', 'e2']);
    slot().querySelector('#drop-player-select').value = 'e2';
    slot().querySelector('#btn-drop-player').click();
    expect(emitted).toContainEqual(['tournament:withdraw', { tournamentId: 't1', entryId: 'e2' }]);
  });

  test('declining the confirm dialog emits nothing', () => {
    setup('u2');
    window.confirm = jest.fn(() => false);
    sock.trigger('tournament:detail', detail([entry(1), entry(2)]));
    slot().querySelector('#btn-withdraw').click();
    expect(emitted.some(([ev]) => ev === 'tournament:withdraw')).toBe(false);
  });

  test('no controls for a withdrawn player, a non-active tournament, or a non-participant', () => {
    setup('u2');
    sock.trigger('tournament:detail', detail([entry(1), entry(2, { withdrawn: true })]));
    expect(slot().querySelector('#btn-withdraw')).toBeNull();

    setup('u2');
    sock.trigger('tournament:detail', detail([entry(1), entry(2)], [], 'completed'));
    expect(slot().querySelector('#btn-withdraw')).toBeNull();

    setup('u9');
    sock.trigger('tournament:detail', detail([entry(1), entry(2)]));
    expect(slot().querySelector('#btn-withdraw')).toBeNull();
  });

  test('forfeit and noshow_cap results render as walkover; withdrawn players are tagged in standings', () => {
    setup('u2');
    const pairing = (reason) => ({
      pairingId: `p-${reason}`, tournamentId: 't1', roundId: 'r', roundIndex: 1,
      player1EntryId: 'e1', player2EntryId: 'e2', state: 'Walkover', readyPlayers: [],
      result: { winnerEntryId: 'e1', reason }, games: [], seriesScore: null,
    });
    sock.trigger('tournament:detail', detail([entry(1), entry(2, { withdrawn: true })], [pairing('withdrawn'), pairing('noshow_cap')]));
    const text = document.getElementById('pairings-container').textContent;
    expect(text.match(/tdetail\.reason_walkover/g)).toHaveLength(2);
    expect(document.getElementById('standings-container').textContent).toContain('tdetail.withdrawn_tag');
  });
});
