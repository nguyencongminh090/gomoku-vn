/**
 * #431 — the room's "Luật" tab: every rule documented with demo boards; the rules in use are flagged.
 *
 * @jest-environment jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8');

function load() {
  document.body.innerHTML = '<div id="rules-guide"></div>';
  window.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'room-rules-guide.js'), 'utf8'));
  return window.RoomRulesGuide;
}
const t = (k) => k;

describe('Luật tab', () => {
  test('room.html has the tab button and its panel', () => {
    expect(HTML).toMatch(/data-tab="tab-rules"/);
    expect(HTML).toMatch(/id="tab-rules"[\s\S]*id="rules-guide"/);
  });

  test('every selectable rule has a section; the website rule ids are covered', () => {
    const G = load();
    const ids = G.SECTIONS.map((s) => s.id);
    for (const id of ['freestyle', 'standard', 'caro', 'renju', 'wall', 'portal', 'swap2', 'taraguchi10', 'yamaguchi']) expect(ids).toContain(id);
  });

  test('all guide keys exist in both languages (lead, points, captions, names)', () => {
    const G = load();
    const keys = new Set(['room.tab_rules', 'guide.in_use']);
    G.GROUPS.forEach((g) => keys.add(`guide.group_${g}`));
    for (const s of G.SECTIONS) {
      keys.add(`guide.${s.id}_lead`);
      for (let i = 1; i <= s.points; i++) keys.add(`guide.${s.id}_p${i}`);
      s.examples.forEach((e) => keys.add(e.cap));
      if (s.nameKey.startsWith('guide.')) keys.add(s.nameKey);
    }
    const [vi, en] = [SRC.indexOf('\n  vi: {'), SRC.indexOf('\n  en: {')];
    for (const k of keys) {
      expect(SRC.slice(vi, en)).toContain(`'${k}':`);
      expect(SRC.slice(en)).toContain(`'${k}':`);
    }
  });

  test('render flags and opens the rules in use, others stay collapsed', () => {
    const G = load();
    G.render(document.getElementById('rules-guide'), { t, active: ['caro', 'wall'] });
    const sec = (id) => document.querySelector(`[data-rule="${id}"]`);
    expect(sec('caro').open).toBe(true);
    expect(sec('caro').querySelector('.rg-live')).not.toBeNull();
    expect(sec('wall').open).toBe(true);
    expect(sec('renju').open).toBe(false);
    expect(sec('renju').querySelector('.rg-live')).toBeNull();
    expect(document.querySelectorAll('.rg-board').length).toBeGreaterThan(10);
  });

  test('boardHtml draws one cell per char; every demo diagram is rectangular', () => {
    const G = load();
    for (const s of G.SECTIONS) for (const e of s.examples) {
      expect(new Set(e.rows.map((r) => r.length)).size).toBe(1);
      document.body.innerHTML = G.boardHtml(e.rows, { zones: e.zones });
      expect(document.querySelectorAll('.rg-c').length).toBe(e.rows.length * e.rows[0].length);
    }
  });

  test('captions are escaped (no raw HTML from t())', () => {
    const G = load();
    G.render(document.getElementById('rules-guide'), { t: () => '<img src=x>', active: [] });
    expect(document.querySelector('#rules-guide img')).toBeNull();
  });
});
