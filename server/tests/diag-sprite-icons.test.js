'use strict';

/**
 * diag-sprite-icons.test.js — every icon the diagnostic page references must
 * exist in the sprite (TODO.md #168 step 5).
 *
 * `client/assets/icons/phosphor-sprite.svg` is a CURATED 46-icon subset built
 * in #129, not the full Phosphor set. An `<use href="...#missing-id">` renders
 * absolutely nothing: no console error, no network request, no failing
 * assertion, no visual placeholder. B129's own task doc names this exact
 * failure mode ("hỏng kiểu này im lặng: icon biến mất, không lỗi console,
 * không fail test") and #129 shipped a one-off script to check it.
 *
 * This is that check, made permanent for the diagnostic page. It caught five
 * missing ids on the first browser run of step 5 — including all three
 * verdict icons, which are the entire point of an icon-led results screen
 * (R8), and which the Playwright walkthrough had happily reported as passing
 * because it asserted on class names and text rather than pixels.
 */

const fs = require('fs');
const path = require('path');

const CLIENT = path.join(__dirname, '..', '..', 'client');
const read = (rel) => fs.readFileSync(path.join(CLIENT, rel), 'utf8');

/** Ids the sprite actually defines. */
function spriteIds() {
  const svg = read('assets/icons/phosphor-sprite.svg');
  return new Set([...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
}

/** Ids referenced from diagnostic.html's markup. */
function htmlIconIds() {
  const html = read('diagnostic.html');
  return [...html.matchAll(/phosphor-sprite\.svg(?:\?v=\d+)?#([a-z0-9-]+)/g)].map((m) => m[1]);
}

/** Ids diag-report.js can emit for any verdict. */
function reportIconIds() {
  const DiagReport = require('../../client/js/diag/diag-report');
  const ids = new Set(Object.values(DiagReport.ICONS));
  ids.add(DiagReport.ICON_UNMEASURED);
  // ...and whatever rows() actually hands the view, across every state.
  const runs = [
    {},
    { halfRttMs: { p90: 10, jitter: 0 }, clockOffsetMs: { p50: 0, driftMsPerMin: 0 }, packetLossPct: 0 },
    { halfRttMs: { p90: 300, jitter: 150 }, clockOffsetMs: { p50: 2000, driftMsPerMin: 500 }, packetLossPct: 2 },
    { halfRttMs: { p90: 900, jitter: 400 }, clockOffsetMs: { p50: 9000, driftMsPerMin: 5000 }, packetLossPct: 20 },
  ];
  for (const run of runs) for (const row of DiagReport.rows(run)) ids.add(row.icon);
  return [...ids];
}

const SPRITE = spriteIds();

describe('diagnostic page sprite icons', () => {
  test('the sprite parses and the extractor is not silently empty', () => {
    // Without this, a broken regex would make every assertion below vacuous.
    expect(SPRITE.size).toBeGreaterThan(20);
    expect(htmlIconIds().length).toBeGreaterThan(5);
    expect(reportIconIds().length).toBeGreaterThan(3);
  });

  test('every icon in diagnostic.html exists in the sprite', () => {
    const missing = [...new Set(htmlIconIds())].filter((id) => !SPRITE.has(id));
    expect(missing).toEqual([]);
  });

  test('every icon diag-report.js can emit exists in the sprite', () => {
    const missing = reportIconIds().filter((id) => !SPRITE.has(id));
    expect(missing).toEqual([]);
  });

  test('the three verdicts use three DIFFERENT shapes, not one glyph recoloured', () => {
    // Colour alone excludes colour-blind readers, and this page exists to
    // tell someone whether something is wrong.
    const DiagReport = require('../../client/js/diag/diag-report');
    const icons = Object.values(DiagReport.ICONS);
    expect(new Set(icons).size).toBe(3);
    expect(icons).not.toContain(DiagReport.ICON_UNMEASURED);
  });

  test('icon references carry the shared ?v= so a sprite change is not cached stale', () => {
    const html = read('diagnostic.html');
    const bare = [...html.matchAll(/phosphor-sprite\.svg#/g)];
    expect(bare).toEqual([]);
  });
});
