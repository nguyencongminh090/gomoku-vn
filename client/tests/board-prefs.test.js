/**
 * TODO.md #216 — shared board look (BoardPrefs), quiet WCAG audit, and the SVG
 * renderer's hit-testing / double-tap flow.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'board.js'), 'utf8');

function load() {
  delete window.BoardPrefs;
  delete window.BoardRenderer;
  // eslint-disable-next-line no-eval
  window.eval(SRC);
  return window.BoardPrefs;
}

beforeEach(() => localStorage.clear());

describe('presets meet WCAG 2.2 AA on their own background', () => {
  const Prefs = load();
  for (const theme of ['paper', 'stone']) {
    for (const p of Prefs.PRESETS[theme]) {
      test.each(['edge', 'cell'])(`${theme}/${p.id} with coords=%s has no problems`, (coords) => {
        const s = Prefs.set({ theme, [theme + 'Preset']: p.id, coords });
        expect(Prefs.problems(s)).toEqual([]);
      });
    }
  }
});

describe('BoardPrefs store', () => {
  test('defaults: paper, cream preset, edge coordinates, last move on', () => {
    const s = load().get();
    expect(s).toMatchObject({ theme: 'paper', paperPreset: 'cream', stonePreset: 'kaya', coords: 'edge', showLastMove: true, showMoveNumbers: false });
  });

  test('migrates the pre-#216 Paper/Stone key', () => {
    localStorage.setItem('play3cr_board_display', 'stone');
    expect(load().get().theme).toBe('stone');
  });

  test('corrupt or hostile stored values fall back per field', () => {
    localStorage.setItem('play3cr_board_prefs', JSON.stringify({
      theme: 'neon', coords: 'cell', paper: { bg: 'red; x', xColor: '#ABCDEF', style: 'sparkle' }, showLastMove: 'yes',
    }));
    const s = load().get();
    expect(s.theme).toBe('paper');
    expect(s.coords).toBe('cell');
    expect(s.paper.bg).toBe('#fbf8f1');
    expect(s.paper.xColor).toBe('#abcdef');
    expect(s.paper.style).toBe('classic');
    expect(s.showLastMove).toBe(true);
  });

  test('unparseable JSON → defaults', () => {
    localStorage.setItem('play3cr_board_prefs', '{nope');
    expect(load().get().theme).toBe('paper');
  });

  test('picking a preset copies its colours; editing one colour marks the look custom', () => {
    const Prefs = load();
    let s = Prefs.set({ paperPreset: 'kraft' });
    expect(s.paper.bg).toBe('#e7d3ad');
    s = Prefs.set({ paper: { oColor: '#000000' } });
    expect(s.paperPreset).toBe('custom');
    expect(s.paper.bg).toBe('#e7d3ad');
    expect(s.paper.oColor).toBe('#000000');
  });

  test('changing only the symbol style keeps the preset', () => {
    const Prefs = load();
    const s = Prefs.set({ paper: { style: 'hand' } });
    expect(s.paperPreset).toBe('cream');
    expect(s.paper.style).toBe('hand');
  });

  test('set() persists, keeps the legacy key in sync and fires boardprefschange', () => {
    const Prefs = load();
    const seen = jest.fn();
    window.addEventListener('boardprefschange', seen);
    Prefs.set({ theme: 'stone' });
    window.removeEventListener('boardprefschange', seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('play3cr_board_prefs')).theme).toBe('stone');
    expect(localStorage.getItem('play3cr_board_display')).toBe('stone');
  });

  test('another tab writing the key → live update here', () => {
    const Prefs = load();
    Prefs.get();
    localStorage.setItem('play3cr_board_prefs', JSON.stringify({ theme: 'stone' }));
    const seen = jest.fn();
    window.addEventListener('boardprefschange', seen);
    window.dispatchEvent(new StorageEvent('storage', { key: 'play3cr_board_prefs' }));
    window.removeEventListener('boardprefschange', seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(Prefs.get().theme).toBe('stone');
  });
});

describe('quiet contrast audit', () => {
  test('a pale O on cream is reported with a passing suggestion', () => {
    const Prefs = load();
    const s = Prefs.set({ paper: { oColor: '#9fc3f0' } });
    const probs = Prefs.problems(s);
    expect(probs.map(p => p.key)).toEqual(['paper.oColor']);
    const { ratio } = window.BoardContrast;
    expect(ratio('#9fc3f0', s.paper.bg)).toBeLessThan(3);
    expect(ratio(probs[0].suggestion, s.paper.bg)).toBeGreaterThanOrEqual(3);
  });

  test('a light grid is advisory only — never reported', () => {
    const Prefs = load();
    expect(Prefs.problems(Prefs.set({ paper: { grid: '#f5f5f5' } }))).toEqual([]);
  });

  test('a stone board too dark for black stones is reported', () => {
    const Prefs = load();
    const probs = Prefs.problems(Prefs.set({ theme: 'stone', stone: { bg: '#2a2a2a' } }));
    expect(probs.some(p => p.what === 'blackStone')).toBe(true);
  });
});

describe('renderer input', () => {
  function setup(clickMode) {
    load();
    document.body.innerHTML = '<div><canvas id="b"></canvas></div>';
    const onCellClick = jest.fn();
    const r = new window.BoardRenderer(document.getElementById('b'), { boardSize: 15, onCellClick, clickMode });
    r.setState({ board: Array.from({ length: 15 }, () => Array(15).fill(0)), interactive: true, isMyTurn: true, myColor: 'BLACK' });
    // 1 css px = 1 viewBox unit; desktop edge coords → margin 34, pitch 40.
    const W = 34 * 2 + 15 * 40;
    r.svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: W });
    const at = (x, y) => ({ clientX: 34 + x * 40 + 20, clientY: 34 + y * 40 + 20 });
    return { r, onCellClick, at };
  }

  test('a click maps to the cell under it', () => {
    const { r, at } = setup('single');
    expect(r._cellFromClient(at(0, 0).clientX, at(0, 0).clientY)).toEqual({ x: 0, y: 0 });
    expect(r._cellFromClient(at(14, 7).clientX, at(14, 7).clientY)).toEqual({ x: 14, y: 7 });
    expect(r._cellFromClient(10, 10)).toBeNull(); // in the label margin
  });

  test('single mode places on the first click', () => {
    const { r, onCellClick, at } = setup('single');
    r._onClick(at(5, 6));
    expect(onCellClick).toHaveBeenCalledWith(5, 6);
  });

  test('double mode: first click marks pending, second on the same cell places', () => {
    const { r, onCellClick, at } = setup('double');
    r._onClick(at(5, 6));
    expect(onCellClick).not.toHaveBeenCalled();
    expect(r._pendingCell).toEqual({ x: 5, y: 6 });
    r._onClick(at(5, 6));
    expect(onCellClick).toHaveBeenCalledWith(5, 6);
    expect(r._pendingCell).toBeNull();
  });

  test('occupied cells and walls are ignored', () => {
    const { r, onCellClick, at } = setup('single');
    const b = r.board.map(row => row.slice());
    b[1][1] = 2; b[2][2] = -1;
    r.setState({ board: b });
    r._onClick(at(1, 1));
    r._onClick(at(2, 2));
    expect(onCellClick).not.toHaveBeenCalled();
  });

  test('a second renderer on the same element replaces the first (no double placement)', () => {
    const { r, onCellClick, at } = setup('single');
    const onCellClick2 = jest.fn();
    const r2 = new window.BoardRenderer(r.svg, { boardSize: 15, onCellClick: onCellClick2, clickMode: 'single' });
    r2.setState({ board: r.board, interactive: true, isMyTurn: true });
    r.svg.dispatchEvent(new MouseEvent('click', at(3, 3)));
    expect(onCellClick).not.toHaveBeenCalled();
    expect(onCellClick2).toHaveBeenCalledWith(3, 3);
  });

  test('cell coordinates mode numbers empty cells only (spiral from the centre)', () => {
    const { r } = setup('single');
    window.BoardPrefs.set({ coords: 'cell' });
    const b = r.board.map(row => row.slice());
    b[7][7] = 1;
    r.setState({ board: b });
    const texts = [...r.svg.querySelectorAll('text')].map(t => t.textContent);
    expect(texts).not.toContain('1'); // centre is occupied
    expect(texts).toContain('2');
    expect(texts.length).toBe(15 * 15 - 1);
  });
});
