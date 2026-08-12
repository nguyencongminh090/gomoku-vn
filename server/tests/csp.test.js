'use strict';

/**
 * csp.test.js — regression test for the CSP policy (TODO.md #65).
 *
 * Verifies the *policy data*, not helmet/Express wiring: the security
 * property that matters here is "script-src never regresses back to
 * allowing inline script or a remote origin", which is a property of the
 * directives object itself. Asserting on that object is enough to catch
 * the regression class this item was written against (a future edit
 * quietly adding 'unsafe-inline' back, or re-adding a CDN like unpkg to
 * script-src) without needing a live server + real DB.
 */
const {
  cspDirectives,
  CF_INSIGHTS_SCRIPT,
  CF_INSIGHTS_REPORT,
} = require('../config/csp');

describe('CSP directives (TODO.md #65)', () => {
  test('script-src allows no inline/eval/wildcard', () => {
    // Exact contents are pinned by the #112 block below. What #65 cares
    // about is the *kind* of source allowed, which must stay narrow even as
    // hosts are added.
    expect(cspDirectives.scriptSrc).not.toContain("'unsafe-inline'");
    expect(cspDirectives.scriptSrc).not.toContain("'unsafe-eval'");
    expect(cspDirectives.scriptSrc).not.toContain('*');
    expect(cspDirectives.scriptSrc).toContain("'self'");
  });

  test('inline event-handler attributes (onclick=...) are blocked', () => {
    expect(cspDirectives.scriptSrcAttr).toEqual(["'none'"]);
  });

  test('no directive allows a wildcard or unpkg/jsdelivr CDN origin', () => {
    const forbidden = /(^\*$|unpkg\.com|jsdelivr\.net)/;
    for (const [directive, sources] of Object.entries(cspDirectives)) {
      for (const source of sources) {
        expect({ directive, source }).not.toMatchObject({
          source: expect.stringMatching(forbidden),
        });
      }
    }
  });

  test('object-src is none (no plugin/embed execution)', () => {
    expect(cspDirectives.objectSrc).toEqual(["'none'"]);
  });

  test('default-src falls back to self', () => {
    expect(cspDirectives.defaultSrc).toEqual(["'self'"]);
  });

  test('style-src explicitly allows only self and inline (fonts are self-hosted, TODO.md #69)', () => {
    expect(cspDirectives.styleSrc).toEqual(["'self'", "'unsafe-inline'"]);
  });

  test('font-src and media-src have no third-party origins (TODO.md #69)', () => {
    expect(cspDirectives.fontSrc).toEqual(["'self'", 'data:']);
    expect(cspDirectives.mediaSrc).toEqual(["'self'"]);
  });
});

/**
 * TODO.md #112 — Cloudflare Web Analytics.
 *
 * Cloudflare injects its beacon at the edge; script-src 'self' blocked it,
 * so analytics collected nothing and each page load logged three CSP errors.
 * The allowance is deliberately the narrowest thing that works, and these
 * tests exist to keep it that way — an allowlisted third-party script origin
 * is exactly what #65 spent effort removing.
 */
describe('CSP — Cloudflare Web Analytics allowance (TODO.md #112)', () => {
  test('the beacon script host is allowed in script-src', () => {
    expect(cspDirectives.scriptSrc).toContain(CF_INSIGHTS_SCRIPT);
  });

  test('the beacon REPORTING host is allowed in connect-src', () => {
    // Measured from beacon.min.js, not assumed: the beacon posts to
    // https://cloudflareinsights.com/cdn-cgi/rum. Allowing only the script
    // host would load the beacon but block its report — "no data" again,
    // just with a different console error. This is the assertion that would
    // have caught that mistake.
    expect(cspDirectives.connectSrc).toContain(CF_INSIGHTS_REPORT);
  });

  test('the two hosts are genuinely different origins', () => {
    // Guards the easy "cleanup" of collapsing these into one constant.
    expect(CF_INSIGHTS_SCRIPT).not.toBe(CF_INSIGHTS_REPORT);
    expect(CF_INSIGHTS_SCRIPT).toBe('https://static.cloudflareinsights.com');
    expect(CF_INSIGHTS_REPORT).toBe('https://cloudflareinsights.com');
  });

  test('both hosts are pinned exactly: https, no wildcard, no bare scheme', () => {
    for (const host of [CF_INSIGHTS_SCRIPT, CF_INSIGHTS_REPORT]) {
      expect(host).toMatch(/^https:\/\//);
      expect(host).not.toContain('*');
      expect(host).not.toMatch(/^https:\/\/[^.]*$/);
    }
  });

  test('the allowance is scoped to script-src and connect-src only', () => {
    // A beacon needs to load and to report. It has no business being a
    // source for styles, fonts, images, media, form targets or frames.
    const untouched = [
      'defaultSrc', 'styleSrc', 'fontSrc', 'imgSrc', 'mediaSrc',
      'objectSrc', 'baseUri', 'formAction', 'frameAncestors',
    ];

    for (const directive of untouched) {
      for (const source of cspDirectives[directive]) {
        expect(source).not.toMatch(/cloudflareinsights/);
      }
    }
  });

  test('exact script-src and connect-src contents are pinned', () => {
    expect(cspDirectives.scriptSrc).toEqual(["'self'", CF_INSIGHTS_SCRIPT]);
    expect(cspDirectives.connectSrc).toEqual(["'self'", CF_INSIGHTS_REPORT]);
  });
});
