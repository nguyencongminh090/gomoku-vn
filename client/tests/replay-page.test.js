/**
 * TODO.md #502 — replay page (mockup A): info, move list + think times, slider, speed, keys, deep link,
 * analysis variations, share, load error. Real replay.html body + move-tree.js + replay-core.js +
 * replay.js; BoardRenderer is a stub that records setState (the SVG board itself is board.js's own suite).
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/replay/g1"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const BODY = read('replay.html').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const SRC = { tree: read('js/move-tree.js') + '\nwindow.MoveTree = MoveTree;', core: read('js/replay-core.js'), page: read('js/replay.js') };
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const $ = (id) => document.getElementById(id);

// Black wins on row 7 (x 3..7) with the 9th move; white answers on row 8.
const T0 = Date.parse('2026-11-20T20:00:00Z');
const XS = [3, 3, 4, 4, 5, 5, 6, 6, 7];
const MOVES = XS.map((x, i) => ({ x, y: i % 2 ? 8 : 7, color: i % 2 ? 'WHITE' : 'BLACK', timestamp: T0 + 1000 + i * 4000 + (i >= 4 ? 61000 : 0) }));
const GAME = (over = {}) => ({
  id: 'g1', board_size: 15, moves: MOVES, walls: [], portals: [], rule_wall: 0, rule_portal: 0,
  black_player_name: 'Lan <b>Anh</b>', white_player_name: 'Minh', winner: 'BLACK', winner_name: 'Lan <b>Anh</b>', reason: 'win',
  started_at: '2026-11-20T20:00:00Z', ended_at: '2026-11-20T20:01:40Z', ...over,
});

let board;
class FakeBoard {
  constructor(canvas, opts) { board = this; this.opts = opts; this.states = []; this.resize = jest.fn(); }
  setState(s) { this.states.push(s); this.last = s; }
}

async function boot({ url = '/replay/g1', game = GAME(), status = 200, body, storage = {} } = {}) {
  if (window.GvnReplay) window.GvnReplay.destroy();
  window.history.replaceState({}, '', url);
  document.body.innerHTML = BODY;
  localStorage.clear();
  Object.entries(storage).forEach(([k, v]) => localStorage.setItem(k, v));
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  window.BoardRenderer = FakeBoard;
  window.requestAnimationFrame = (fn) => fn();
  window.confirm = jest.fn(() => true);
  global.fetch = jest.fn(() => Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(body || { game }) }));
  window.eval(SRC.tree);
  window.eval(SRC.core);
  window.eval(SRC.page);
  await window.GvnReplay.ready;
  await flush();
}
const key = (k, target = document.body) => target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const depth = () => window.GvnReplay.tree.currentNode.depth;
const moveParam = () => new URLSearchParams(window.location.search).get('move');

afterEach(() => { if (window.GvnReplay) window.GvnReplay.destroy(); jest.useRealTimers(); });

describe('info + move list', () => {
  it('names render as text, the winner gets the won pill, meta is separate chips with the duration', async () => {
    await boot();
    expect($('replay-black').querySelector('.rp-name').textContent).toBe('Lan <b>Anh</b>');
    expect($('replay-black').querySelector('b')).toBeNull();
    expect($('replay-black').querySelector('.rp-win')).not.toBeNull();
    expect($('replay-white').querySelector('.rp-win')).toBeNull();
    const chips = [...$('replay-meta').querySelectorAll('.rp-chip')].map((c) => c.textContent);
    expect(chips).toEqual(expect.arrayContaining(['15×15', 'lobby.rule_basic', 'replay.n_moves{"n":9}', '1:40']));
    expect($('replay-meta').textContent).not.toMatch(/\|/);
  });

  it('numbered pairs with think times; move 1 shows —', async () => {
    await boot();
    const rows = $('rp-moves').querySelectorAll('.rp-row');
    expect(rows).toHaveLength(5);
    expect(rows[0].querySelector('.rp-no').textContent).toBe('1');
    const t = [...$('rp-moves').querySelectorAll('.rp-mv__t')].map((n) => n.textContent);
    expect(t).toEqual(['—', '4s', '4s', '4s', '1:05', '4s', '4s', '4s', '4s']);
    expect(rows[4].children).toHaveLength(3); // last row: black only + an empty cell
  });

  it('a move without a numeric timestamp hides every time and the duration chip', async () => {
    await boot({ game: GAME({ moves: MOVES.map((m, i) => (i === 3 ? { ...m, timestamp: undefined } : m)) }) });
    expect($('rp-moves').querySelectorAll('.rp-mv__t')).toHaveLength(0);
    expect($('replay-meta').textContent).not.toMatch('1:40');
  });

  it('clicking a list cell or a strip chip jumps there and marks it current', async () => {
    await boot();
    $('rp-moves').querySelectorAll('.rp-mv')[2].click();
    expect(depth()).toBe(3);
    expect($('rp-moves').querySelector('[aria-current="step"]').textContent).toMatch(/^[A-T]\d+/);
    $('rp-strip').querySelectorAll('.rp-chipmv')[6].click();
    expect(depth()).toBe(7);
    expect($('rp-strip').querySelector('.is-cur b').textContent).toBe('7');
  });
});

describe('timeline, transport, speed', () => {
  it('slider spans the main line and drives the board, counter, aria-valuetext and URL', async () => {
    await boot();
    expect($('rp-slider').max).toBe('9');
    expect(depth()).toBe(0);
    $('rp-slider').value = '4';
    $('rp-slider').dispatchEvent(new Event('input'));
    expect(depth()).toBe(4);
    expect($('move-counter').textContent).toBe('4/ 9');
    expect($('rp-slider').getAttribute('aria-valuetext')).toBe('replay.move_of{"n":4,"total":9}');
    expect(moveParam()).toBe('4');
    $('btn-first').click();
    expect(moveParam()).toBeNull();
  });

  it('speed: 0.5× / 1× / 2× = 1200 / 600 / 300 ms, remembered, used by playback', async () => {
    jest.useFakeTimers();
    await boot({ storage: { gvn_replay_speed: '1200' } });
    expect($('rp-speed').querySelector('[aria-pressed="true"]').dataset.speed).toBe('1200');
    $('rp-speed').querySelector('[data-speed="300"]').click();
    expect(localStorage.getItem('gvn_replay_speed')).toBe('300');
    expect($('rp-speed').querySelector('.is-active').dataset.speed).toBe('300');
    $('btn-play').click();
    expect($('btn-play').getAttribute('aria-label')).toBe('replay.pause');
    jest.advanceTimersByTime(900);
    expect(depth()).toBe(3);
    $('btn-play').click();
    expect($('btn-play').getAttribute('aria-label')).toBe('replay.play');
  });

  it('a stored speed outside the three options falls back to 1×', async () => {
    await boot({ storage: { gvn_replay_speed: '5' } });
    expect($('rp-speed').querySelector('[aria-pressed="true"]').dataset.speed).toBe('600');
  });
});

describe('keyboard', () => {
  it('← → Home End move; Space plays; A toggles analysis', async () => {
    jest.useFakeTimers();
    await boot();
    key('ArrowRight'); key('ArrowRight');
    expect(depth()).toBe(2);
    key('ArrowLeft');
    expect(depth()).toBe(1);
    key('End');
    expect(depth()).toBe(9);
    key('Home');
    expect(depth()).toBe(0);
    key(' ');
    jest.advanceTimersByTime(600);
    expect(depth()).toBe(1);
    key(' ');
    jest.advanceTimersByTime(1200);
    expect(depth()).toBe(1);
    key('a');
    expect($('btn-analysis').getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem('gvn_replay_analysis')).toBe('1');
  });

  it('arrow keys on the focused slider step once; typing in the report form or its select is ignored', async () => {
    await boot();
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    $('rp-slider').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(depth()).toBe(1);
    key('a', $('rr-reason'));
    key('a', $('rr-side'));
    key('ArrowRight', $('rr-reason'));
    expect($('btn-analysis').getAttribute('aria-checked')).toBe('false');
    expect(depth()).toBe(1);
  });

  it('a key the focused board already handled (defaultPrevented) does not also step the replay', async () => {
    await boot();
    const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    ev.preventDefault();
    $('rp-board').dispatchEvent(ev);
    expect(depth()).toBe(0);
  });

  it('Space on a focused button is left to the button (no double toggle)', async () => {
    await boot();
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    $('btn-next').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect($('btn-play').getAttribute('aria-label')).toBe('replay.play');
  });
});

describe('deep link ?move=N', () => {
  it.each([['?move=5', 5], ['?move=999', 9], ['?move=-2', 0], ['?move=x', 0]])('%s opens at %d', async (q, n) => {
    await boot({ url: '/replay/g1' + q });
    expect(depth()).toBe(n);
  });

  it('tournament: fetches the tournament game and keeps source=tournament in the URL', async () => {
    await boot({ url: '/replay/g1?source=tournament&move=2', game: GAME({ tournament_id: 't9' }) });
    expect(global.fetch).toHaveBeenCalledWith('/api/tournament-games/g1');
    key('ArrowRight');
    expect(window.location.search).toBe('?source=tournament&move=3');
  });
});

describe('no win line (the winning rule is not stored, #501)', () => {
  it('the final position of a five-in-a-row game is not highlighted', async () => {
    await boot();
    key('End');
    expect(board.last.winLine).toBeNull();
  });

  it('an analysis move after the end is a variation; the slider stays on the main line', async () => {
    await boot({ storage: { gvn_replay_analysis: '1' } });
    key('End');
    board.opts.onCellClick(10, 10);
    expect(depth()).toBe(10);
    expect($('rp-slider').value).toBe('9');
  });
});

describe('analysis variations', () => {
  it('a board click adds an inline variation; Delete removes it; the game moves stay', async () => {
    await boot({ url: '/replay/g1?move=4', storage: { gvn_replay_analysis: '1' } });
    expect($('btn-delete-branch').disabled).toBe(true);
    board.opts.onCellClick(12, 12);
    expect($('rp-moves').querySelectorAll('.rp-var')).toHaveLength(1);
    expect($('rp-moves').querySelector('.rp-var .is-cur')).not.toBeNull();
    expect($('rp-ticks').children).toHaveLength(1);
    expect($('btn-delete-branch').disabled).toBe(false);
    key('Delete');
    expect(window.confirm).toHaveBeenCalled();
    expect($('rp-moves').querySelectorAll('.rp-var')).toHaveLength(0);
    expect(depth()).toBe(4);
    key('Delete');
    expect(window.GvnReplay.mainLine).toHaveLength(9);
    expect(window.GvnReplay.tree.currentNode).toBe(window.GvnReplay.mainLine[3]);
  });

  it('board clicks do nothing with analysis off', async () => {
    await boot();
    board.opts.onCellClick(12, 12);
    expect(depth()).toBe(0);
  });
});

describe('share + errors', () => {
  it('copies a link to the move on the board', async () => {
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await boot({ url: '/replay/g1?move=6' });
    $('rp-share').click();
    await flush();
    expect(writeText).toHaveBeenCalledWith('http://localhost/replay/g1?move=6');
    expect($('rp-toast').textContent).toBe('replay.copied_move{"n":6}');
  });

  it('without a clipboard API the toast shows the link', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await boot();
    $('rp-share').click();
    await flush();
    expect($('rp-toast').textContent).toBe('replay.copy_manual{"url":"http://localhost/replay/g1"}');
  });

  it('a load error is an inline note, not an alert', async () => {
    window.alert = jest.fn();
    await boot({ status: 404, body: { code: 'GAME_NOT_FOUND' } });
    expect(window.alert).not.toHaveBeenCalled();
    expect($('rp-error').hidden).toBe(false);
    expect($('rp-error').textContent).toBe('err.game_not_found');
    expect($('view-replay').classList.contains('rp--error')).toBe(true);
  });
});
