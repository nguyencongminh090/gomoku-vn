/**
 * diag-i18n-coverage.test.js — every key the diagnostic page can render must
 * exist in BOTH dictionaries (TODO.md #168 step 5).
 *
 * The failure this guards against is silent and player-visible: `t()` returns
 * the key itself when it is missing, so a reporter would see the literal text
 * `diag.verdict_connection_red` where a sentence belongs. Nothing throws, no
 * test fails, and the page still "works" — which is exactly why it needs a
 * test of its own.
 *
 * Keys come from three places and all three are checked: the page's
 * `data-i18n`/`data-i18n-placeholder` attributes, the keys diag-report.js
 * emits for every possible verdict, and the error strings diag-entry.js
 * looks up.
 *
 * @jest-environment jsdom
 */

'use strict';



const fs = require('fs');
const path = require('path');

const CLIENT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(CLIENT, rel), 'utf8');

const DiagReport = require('../js/diag/diag-report');

/** Load i18n.js for real — jsdom supplies the document/localStorage it wants. */
function loadI18n() {
  window.eval(read('js/i18n.js'));
  return window;
}

/** Pull the two dictionaries out of the module's source. */
function dictionaries() {
  const { t, setLanguage } = loadI18n();
  return {
    lookup(lang, key) {
      setLanguage(lang);
      return t(key);
    },
  };
}

/** Keys referenced from the page markup. */
function htmlKeys() {
  const html = read('diagnostic.html');
  const keys = new Set();
  for (const m of html.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)) keys.add(m[1]);
  return [...keys];
}

/** Every key diag-report.js can produce, across all verdict combinations. */
function reportKeys() {
  const keys = new Set();
  const runs = [
    {}, // nothing measured -> the unmeasured message
    { halfRttMs: { p90: 10, jitter: 0 }, clockOffsetMs: { p50: 0, driftMsPerMin: 0 }, packetLossPct: 0 },
    { halfRttMs: { p90: 300, jitter: 150 }, clockOffsetMs: { p50: 2000, driftMsPerMin: 500 }, packetLossPct: 2 },
    { halfRttMs: { p90: 900, jitter: 400 }, clockOffsetMs: { p50: 9000, driftMsPerMin: 5000 }, packetLossPct: 20 },
  ];
  for (const run of runs) {
    for (const row of DiagReport.rows(run)) {
      keys.add(row.labelKey);
      keys.add(row.messageKey);
    }
    for (const d of DiagReport.details(run)) keys.add(d.labelKey);
  }
  return [...keys];
}

/** Keys looked up from diag-entry.js via t('...'). */
function entryKeys() {
  const src = read('js/diag/diag-entry.js');
  const keys = new Set();
  for (const m of src.matchAll(/t\('(diag\.[a-z0-9_]+)'\)/g)) keys.add(m[1]);
  return [...keys];
}

const ALL_KEYS = [...new Set([...htmlKeys(), ...reportKeys(), ...entryKeys()])].sort();

describe('diagnostic page i18n coverage', () => {
  test('the page actually references some keys (the extractors are not silently empty)', () => {
    // Without this, a broken regex above would make every test below vacuous.
    expect(htmlKeys().length).toBeGreaterThan(10);
    expect(reportKeys().length).toBeGreaterThan(10);
    expect(entryKeys().length).toBeGreaterThan(2);
  });

  test.each(['vi', 'en'])('every key resolves to real text in %s', (lang) => {
    const dict = dictionaries();
    const missing = ALL_KEYS.filter((k) => dict.lookup(lang, k) === k);
    expect(missing).toEqual([]);
  });

  test('vi and en actually differ — a copy-paste of one into the other would pass the check above', () => {
    const dict = dictionaries();
    const identical = ALL_KEYS.filter((k) => dict.lookup('vi', k) === dict.lookup('en', k));
    // A couple of keys legitimately match across languages (e.g. bare
    // numbers or brand words); the bulk must not.
    expect(identical.length).toBeLessThan(ALL_KEYS.length * 0.2);
  });

  test('every verdict colour has its own sentence per axis, in both languages', () => {
    const dict = dictionaries();
    for (const axis of ['connection', 'clock', 'stability']) {
      for (const lang of ['vi', 'en']) {
        const texts = ['green', 'yellow', 'red']
          .map((v) => dict.lookup(lang, `diag.verdict_${axis}_${v}`));
        expect(new Set(texts).size).toBe(3); // three distinct sentences
        for (const s of texts) expect(s.length).toBeGreaterThan(15);
      }
    }
  });

  test('no user-facing string leaks jargon the reporter would not know', () => {
    // R8: built for a non-technical player. The technical figures live in a
    // collapsed block with their own labels; the verdicts must not.
    const dict = dictionaries();
    const jargon = /\b(RTT|latency|packet loss|jitter|percentile|p90|p99|socket|EMA)\b/i;
    const verdictKeys = ALL_KEYS.filter((k) => k.startsWith('diag.verdict_'));
    for (const lang of ['vi', 'en']) {
      for (const k of verdictKeys) {
        expect(dict.lookup(lang, k)).not.toMatch(jargon);
      }
    }
  });
});
