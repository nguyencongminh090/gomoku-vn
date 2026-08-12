'use strict';

/**
 * client-path.test.js — Regression guard for TODO.md #109.
 *
 * server/index.js used to pick its static root with
 *
 *     process.env.NODE_ENV === 'production' ? '../dist' : '../client'
 *
 * which meant production served whatever the last `vite build` had produced.
 * Nothing rebuilt it, and nothing checked it was current: measured 4 days
 * stale, missing #103/#104, the #95-#102 OAuth work, and #107/#108/#111. So
 * "turning on production mode" would have quietly reverted shipped fixes —
 * the same failure mode as #65, where a fixed-in-client/ CSP hole kept
 * shipping from a stale dist/.
 *
 * The branch is gone; client/ is the only static root. This test exists
 * because re-adding an env-conditional root is an easy, plausible-looking
 * "optimization" that would restore the trap, and nothing else in the suite
 * would notice.
 */

const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.js');

/** index.js source with comment lines removed — the prose above the code
 *  discusses dist/ and NODE_ENV at length and would match every assertion. */
const source = fs
  .readFileSync(indexPath, 'utf8')
  .split('\n')
  .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
  .join('\n');

describe('static root selection (TODO.md #109)', () => {
  test('client/ is the static root', () => {
    expect(source).toMatch(/const clientPath = path\.join\(__dirname, '\.\.', 'client'\)/);
  });

  test('no dist/ path is constructed', () => {
    expect(source).not.toMatch(/'dist'/);
    expect(source).not.toMatch(/\.\.\/dist/);
  });

  test('the static root does not depend on NODE_ENV', () => {
    // NODE_ENV may still legitimately appear elsewhere (the socket.io CORS
    // default), so scope the assertion to the clientPath assignment rather
    // than banning the variable outright.
    const assignment = source.slice(
      source.indexOf('const clientPath'),
      source.indexOf(';', source.indexOf('const clientPath')) + 1
    );

    expect(assignment).not.toMatch(/NODE_ENV/);
    expect(assignment).not.toMatch(/\?/);
  });

  test('the resolved directory really is the client source tree', () => {
    // Guards against the path being right but pointing somewhere empty.
    const clientDir = path.join(__dirname, '..', '..', 'client');

    expect(fs.existsSync(path.join(clientDir, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(clientDir, 'js', 'i18n.js'))).toBe(true);
  });
});
