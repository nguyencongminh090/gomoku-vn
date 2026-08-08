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
const { cspDirectives } = require('../config/csp');

describe('CSP directives (TODO.md #65)', () => {
  test('script-src is same-origin only, no inline/eval/wildcard', () => {
    expect(cspDirectives.scriptSrc).toEqual(["'self'"]);
    expect(cspDirectives.scriptSrc).not.toContain("'unsafe-inline'");
    expect(cspDirectives.scriptSrc).not.toContain("'unsafe-eval'");
    expect(cspDirectives.scriptSrc).not.toContain('*');
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

  test('style-src explicitly allows only self, inline, and Google Fonts', () => {
    expect(cspDirectives.styleSrc).toEqual(
      expect.arrayContaining(["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'])
    );
    expect(cspDirectives.styleSrc).toHaveLength(3);
  });
});
