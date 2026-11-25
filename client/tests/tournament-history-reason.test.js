/**
 * #471 — tournament games history (and the replay header) showed raw reason codes ("Trúc Mai won — win",
 * "Draw — agreement"): GameEngine writes 'win' / 'agreement' but the client maps only knew
 * normal / draw_agreement / resign / timeout / board_full. Every stored reason must render as text in vi + en.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/tournament.html?id=t1"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BODY_HTML = fs.readFileSync(path.join(__dirname, '..', 'tournament.html'), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
const flush = () => new Promise((r) => setTimeout(r, 0));

// Every reason GameEngine / tournament flow stores for a finished game, plus the legacy names.
const CASES = [
  // [reason, winner, vi, en]
  ['win', 'BLACK', 'Đen thắng — 5 liên tiếp', 'Đen won — Five in a row'],
  ['agreement', 'draw', 'Hoà — Đồng ý hoà', 'Draw — Agreed draw'],
  ['resign', 'WHITE', null, null],
  ['timeout', 'BLACK', 'Đen thắng — Hết giờ', null],
  ['board_full', 'draw', 'Hoà — Bàn cờ đầy', null],
  ['normal', 'BLACK', 'Đen thắng — 5 liên tiếp', 'Đen won — Five in a row'],
  ['draw_agreement', 'draw', 'Hoà — Đồng ý hoà', 'Draw — Agreed draw'],
];
const RAW = /— (win|agreement|resign|timeout|board_full|normal|draw_agreement)$/;

const game = (reason, winner, i) => ({
  id: 'g' + i, pairing_id: 'p1', black_player_name: 'Đen', white_player_name: 'Trắng',
  winner, reason, ended_at: '2026-11-25T09:57:51.303Z',
});

let sock;
async function historyTexts(lang) {
  document.body.innerHTML = BODY_HTML;
  window.GvnSession = { requireAuth: jest.fn(), getUser: jest.fn(() => ({ userId: 'u1', displayName: 'X', isGuest: false })) };
  window.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8'));
  window.setLanguage(lang);
  window.EscapeUtils = require('../js/escape-utils.js');
  window.fetch = jest.fn(() => Promise.resolve({ ok: true,
    json: () => Promise.resolve({ games: CASES.map(([r, w], i) => game(r, w, i)), pagination: { page: 1, totalPages: 1 } }) }));
  window.SocketClient = class {
    constructor() { this._h = {}; sock = this; }
    emit() {}
    on(ev, cb) { (this._h[ev] = this._h[ev] || []).push(cb); }
    bindStatusBanner() {}
    trigger(ev, p) { (this._h[ev] || []).forEach((cb) => cb(p)); }
  };
  jest.resetModules();
  require('../js/tournament-detail.js');
  sock.trigger('tournament:detail', {
    tournament: { tournamentId: 't1', name: 'T', format: 'swiss', organizerId: 'u1', organizerName: 'X', ruleSet: {}, status: 'completed', entries: [], currentRoundIndex: 1, totalRounds: 1 },
    pairings: [],
  });
  document.getElementById('sub-tab-games').click();
  await flush(); await flush();
  return [...document.querySelectorAll('#games-container tbody tr td:nth-child(3)')].map((td) => td.textContent.trim());
}

describe('tournament games history renders every stored reason as text (#471)', () => {
  it.each(['vi', 'en'])('%s: no raw reason code, engine codes map to the history keys', async (lang) => {
    const texts = await historyTexts(lang);
    expect(texts).toHaveLength(CASES.length);
    texts.forEach((txt) => expect(txt).not.toMatch(RAW));
    CASES.forEach(([, , vi, en], i) => {
      const want = lang === 'vi' ? vi : en;
      if (want) expect(texts[i]).toBe(want);
    });
  });
});

describe('replay header result text (#471)', () => {
  // replay.js is a page script with DOM-bound top-level code; evaluate its real getResultTextFull body.
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'replay.js'), 'utf8');
  const fnSrc = src.match(/function getResultTextFull\(g\) \{[\s\S]*?\n\}/)[0];

  it.each(['vi', 'en'])('%s: engine codes win / agreement render as text', (lang) => {
    window.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8'));
    window.setLanguage(lang);
    const getResultTextFull = window.eval('(' + fnSrc + ')');
    const win = getResultTextFull({ winner: 'BLACK', winner_name: 'Đen', reason: 'win' });
    const draw = getResultTextFull({ winner: 'draw', reason: 'agreement' });
    expect(win).toBe(lang === 'vi' ? 'Đen thắng — 5 liên tiếp' : 'Đen won — Five in a row');
    expect(draw).toBe(lang === 'vi' ? 'Hoà — Đồng ý hoà' : 'Draw — Agreed draw');
  });
});
