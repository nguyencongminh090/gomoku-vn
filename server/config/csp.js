'use strict';

/**
 * csp.js — Content-Security-Policy directives for helmet (TODO.md #65).
 *
 * Pulled out of index.js so the policy itself is unit-testable without
 * booting the HTTP server / DB (see server/tests/csp.test.js). Every script
 * the client ships is same-origin (client/js/*.js, or the socket.io client
 * at /vendor/socket.io/socket.io.min.js) — the app has no inline <script>,
 * so script-src never needs 'unsafe-inline'. style-src keeps 'unsafe-inline'
 * deliberately: the app has
 * many pre-existing style="" attributes with no JS-execution risk, so
 * hashing each one isn't worth the fragility for the threat this policy
 * targets (a script reading localStorage's JWT) — see
 * docs/instruction/B65-csp-va-third-party-script-bao-ve-jwt-localstorage.md.
 */
/**
 * Cloudflare Web Analytics (TODO.md #112).
 *
 * Cloudflare injects its beacon at the edge into every HTML page it serves —
 * it is not in this repo's source, and the origin's HTML is byte-identical
 * to what Cloudflare delivers. With script-src 'self' the browser blocked
 * it, so the analytics collected nothing and every page load logged three
 * CSP errors.
 *
 * The two hosts are NOT the same, and this is the whole reason the guidance
 * for #112 said to measure rather than assume: the beacon is *loaded from*
 * static.cloudflareinsights.com but *posts its data to* cloudflareinsights.com
 * (`https://cloudflareinsights.com/cdn-cgi/rum`, read out of beacon.min.js
 * itself). Allowlisting only the script host would leave the beacon running
 * but unable to report — the same "no data" outcome, just with a different
 * console error.
 *
 * Exact hosts, never a wildcard: this is a third-party script origin, which
 * is precisely the class of thing #65 removed, so the allowance is kept as
 * narrow as it can be while still working.
 */
const CF_INSIGHTS_SCRIPT = 'https://static.cloudflareinsights.com';
const CF_INSIGHTS_REPORT = 'https://cloudflareinsights.com';

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", CF_INSIGHTS_SCRIPT],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  fontSrc: ["'self'", 'data:'],
  imgSrc: ["'self'", 'data:'],
  mediaSrc: ["'self'"],
  connectSrc: ["'self'", CF_INSIGHTS_REPORT],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'self'"],
};

module.exports = { cspDirectives, CF_INSIGHTS_SCRIPT, CF_INSIGHTS_REPORT };
