'use strict';

/**
 * timer-sync-conformance.test.js — Guards the #168 step-1 extraction.
 *
 * `client/js/timer-sync-core.js` exists so the room and the diagnostic page
 * describe the SAME clock. That only holds while the room actually calls it.
 * The failure mode this test exists for is silent: someone debugging a timer
 * issue inlines "just this one" expression back into room-socket.js, both
 * files keep passing their own tests, and every diagnostic report from then on
 * describes a clock the room no longer runs.
 *
 * Source-text assertions, deliberately. There is no client-side test runner in
 * this repo (see CLAUDE.md) and no jsdom harness for room-socket.js/game-ui.js,
 * so a behavioural check is not available — grepping the shipped source is.
 * Keep the patterns narrow: they must catch a re-inlined copy without failing
 * on ordinary edits to unrelated parts of these large files.
 */

const fs = require('fs');
const path = require('path');

const CLIENT_JS = path.join(__dirname, '..', '..', 'client', 'js');
const read = (f) => fs.readFileSync(path.join(CLIENT_JS, f), 'utf8');

/** Strip block and line comments so prose about the maths isn't mistaken for it. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const roomSocket = stripComments(read('room-socket.js'));
const gameUi = stripComments(read('game-ui.js'));

describe('the room imports the shared clock maths', () => {
  test('room-socket.js calls the core for transit delay, ticks and clock offset', () => {
    expect(roomSocket).toContain('global.TimerSyncCore.transitDelaySec(');
    expect(roomSocket).toContain('global.TimerSyncCore.compensatedRemainingSec(');
    expect(roomSocket).toContain('global.TimerSyncCore.displayShaveSec(');
    expect(roomSocket).toContain('global.TimerSyncCore.clockOffsetMs(');
  });

  test('game-ui.js folds move round-trips through the core', () => {
    expect(gameUi).toContain('global.TimerSyncCore.halfRttEma(');
  });

  test('room.html loads timer-sync-core.js as a classic script', () => {
    // Not an entry-module import: Vite's commonjs plugin lazily wraps UMD
    // files, which would leave window.TimerSyncCore unset in a production
    // build (TODO.md #65 fix-log). The vite.config.js scanner copies classic
    // <script src="js/..."> tags into dist/ automatically.
    const roomHtml = fs.readFileSync(
      path.join(__dirname, '..', '..', 'client', 'room.html'), 'utf8');
    expect(roomHtml).toMatch(/<script src="js\/timer-sync-core\.js\?v=\d+"><\/script>/);

    const entry = read('room-entry.js');
    expect(entry).not.toContain('timer-sync-core');
  });
});

describe('no private copy of the clock maths survives in the room files', () => {
  test.each([
    ['room-socket.js', () => roomSocket],
    ['game-ui.js', () => gameUi],
  ])('%s does not re-inline the 8s transit clamp', (_name, get) => {
    // The clamp lives in exactly one place: TRANSIT_CLAMP_MS.
    expect(get()).not.toMatch(/Math\.min\s*\([^)]*8000/);
  });

  test.each([
    ['room-socket.js', () => roomSocket],
    ['game-ui.js', () => gameUi],
  ])('%s does not re-inline the 30s stall ceiling', (_name, get) => {
    expect(get()).not.toMatch(/>\s*30000/);
  });

  test('game-ui.js does not re-inline the 50/50 EMA blend', () => {
    expect(gameUi).not.toMatch(/\*\s*0\.5\s*\+/);
  });

  test('room-socket.js does not re-derive the offset by subtracting two clocks', () => {
    // The pre-#168 shape was `(sync.serverTime || Date.now()) - Date.now()`.
    expect(roomSocket).not.toMatch(/serverTime[^;\n]*\|\|[^;\n]*\)\s*-\s*Date\.now\(\)/);
  });

  test('the core itself is the only file that owns these constants', () => {
    const core = stripComments(read('timer-sync-core.js'));
    expect(core).toContain('const RTT_SAMPLE_MAX_MS = 30000;');
    expect(core).toContain('const TRANSIT_CLAMP_MS = 8000;');
    expect(core).toContain('const EMA_ALPHA = 0.5;');
  });
});
