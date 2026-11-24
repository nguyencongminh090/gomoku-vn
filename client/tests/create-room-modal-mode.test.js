/**
 * Create-room modal (Arena) — rated/friendly choice maps onto room.settings.ranked.
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('create-room modal: rated / friendly', () => {
  const html = read('index.html');
  const lobby = read('js/lobby.js');
  const i18n = read('js/i18n.js');

  test('modal has a roomMode select (rated default), inside the create modal', () => {
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
    const sel = document.getElementById('rm-select');
    expect(sel.tagName).toBe('SELECT');
    expect(sel.name).toBe('roomMode');
    expect(sel.value).toBe('rated');
    expect([...sel.options].map((o) => o.value)).toEqual(['rated', 'friendly']);
    expect(document.getElementById('modal-create').contains(sel)).toBe(true);
  });

  test('lobby.js submits and restores `ranked`', () => {
    expect(lobby).toMatch(/ranked,\s*ruleWall/);
    expect(lobby).toMatch(/pick\('roomMode'\)/);
    expect(lobby).toMatch(/s\.ranked === false \? 'friendly' : 'rated'/);
  });

  test.each(['modal.mode', 'modal.mode_rated_desc', 'modal.mode_friendly_desc', 'modal.mode_guest_note', 'modal.win_rule', 'modal.opening'])(
    'i18n key %s exists in vi and en', (k) => {
      expect(i18n.split(`'${k}':`).length - 1).toBe(2);
    });
});

describe('create-room modal: dropdowns + remembered settings (F402)', () => {
  const lobby = read('js/lobby.js');
  const html = read('index.html');
  const DEFAULTS = { boardSize: 19, winningRule: 'freestyle', ranked: true, ruleWall: false, rulePortal: false, ruleSwap2: false, openingRule: null, timerMode: 'per_move', timerSeconds: 60, timerIncrementSeconds: 0 };
  const LITE = { ...DEFAULTS, ruleWall: true };

  // Load the real helpers from lobby.js against the real form markup.
  function load({ guest = false, server = null, local = null } = {}) {
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
    const fn = (name) => {
      const m = lobby.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}\\n`));
      expect(m).not.toBeNull();
      return m[0];
    };
    const src = `const hintCalls = [];
      const pick = (name) => (document.querySelector(\`select[name="\${name}"]\`) || {}).value;
      let serverRoomDefaults = ${JSON.stringify(server)};
      const LAST_SETTINGS_KEY = 'k';
      const RENJU_OPENINGS = ['taraguchi10', 'yamaguchi'];
      const userInfo = { isGuest: ${guest} };
      let modalRule = null;
      ${fn('readLocalSettings')} ${fn('rememberedSettings')} ${fn('readFormSettings')} ${fn('applySettingsToForm')}
      function updateModalSummary() {}
      function updateModeHint() { hintCalls.push(pick('roomMode')); }
      return { hintCalls, rememberedSettings, readFormSettings, applySettingsToForm };`;
    return new Function('LITE_DEFAULT_SETTINGS', 'localStorage', src)(LITE, { getItem: () => (local ? JSON.stringify(local) : null) });
  }

  test('every choice is a select; no radio pills left in the room modal', () => {
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
    const modal = document.getElementById('modal-create');
    for (const n of ['roomMode', 'boardSize', 'winRule', 'openRule', 'timerMode']) {
      expect(modal.querySelector(`select[name="${n}"]`)).not.toBeNull();
    }
    expect(modal.querySelectorAll('input[type="radio"]').length).toBe(0);
    expect(modal.querySelectorAll('label[for]').length).toBeGreaterThan(0);
    modal.querySelectorAll('select').forEach((s) => expect(modal.querySelector(`label[for="${s.id}"]`)).not.toBeNull());
  });

  test('member: remembered server settings round-trip through the form', () => {
    const saved = { boardSize: 19, winningRule: 'caro', ranked: false, ruleWall: false, rulePortal: false, ruleSwap2: true, openingRule: null, timerMode: 'blitz', timerSeconds: 180, timerIncrementSeconds: 2 };
    const h = load({ server: saved });
    h.applySettingsToForm(h.rememberedSettings());
    expect(h.readFormSettings()).toEqual(saved);
  });

  test('summary is one chip per setting, never a "a · b · c" string', () => {
    const body = lobby.match(/function updateModalSummary\(\) \{[\s\S]*?\n\}\n/)[0];
    expect(body).not.toMatch(/join\(/);
    expect(body).toMatch(/modal__chip/);
  });

  test('applying settings refreshes the mode hint (synthetic change does not bubble)', () => {
    const h = load({ server: { ranked: false } });
    h.applySettingsToForm(h.rememberedSettings());
    expect(h.hintCalls).toEqual(['friendly']);
  });

  test('Renju 15x15 + Taraguchi-10 round-trips; plain board forced (#427)', () => {
    const saved = { boardSize: 15, winningRule: 'renju', ranked: true, ruleWall: false, rulePortal: false, ruleSwap2: false, openingRule: 'taraguchi10', timerMode: 'per_move', timerSeconds: 60, timerIncrementSeconds: 0 };
    const h = load({ server: { ...saved, ruleWall: true } });
    h.applySettingsToForm(h.rememberedSettings());
    expect(h.readFormSettings()).toEqual(saved);
  });

  test('a Renju opening on a non-Renju rule reads back as none (#427)', () => {
    const h = load({ server: { ...DEFAULTS, openingRule: 'yamaguchi' } });
    h.applySettingsToForm(h.rememberedSettings());
    expect(h.readFormSettings().openingRule).toBeNull();
  });

  test('member with nothing remembered → the fixed preset (19, wall)', () => {
    const h = load();
    h.applySettingsToForm(h.rememberedSettings());
    expect(h.readFormSettings()).toEqual(LITE);
  });

  test('guest: friendly always, but other settings come from this browser', () => {
    const h = load({ guest: true, local: { boardSize: 15, ranked: true, timerMode: 'per_game', timerSeconds: 300 } });
    expect(h.rememberedSettings()).toMatchObject({ boardSize: 15, timerMode: 'per_game', ranked: false });
    h.applySettingsToForm(h.rememberedSettings());
    expect(h.readFormSettings().ranked).toBe(false);
  });

  test('unknown stored values leave the select on a valid option', () => {
    const h = load({ server: { boardSize: 99, winningRule: 'nope', timerMode: 'x' } });
    h.applySettingsToForm(h.rememberedSettings());
    expect(h.readFormSettings()).toMatchObject({ boardSize: 19, winningRule: 'freestyle', timerMode: 'per_move' });
  });

  test('guest default is computed on each open, not once at init', () => {
    expect(lobby).toMatch(/function openModal\([^)]*\) \{[\s\S]*?rememberedSettings\(\)/);
    expect(lobby).toMatch(/userInfo\.isGuest\s*\? \{[^\n]*ranked: false/);
  });
});
