'use strict';

/**
 * csp.js — Content-Security-Policy directives for helmet (TODO.md #65).
 *
 * Pulled out of index.js so the policy itself is unit-testable without
 * booting the HTTP server / DB (see server/tests/csp.test.js). Every script
 * the client loads is same-origin (client/js/*.js, or the socket.io client
 * at /socket.io/socket.io.js) — the app has no inline <script> and no
 * remote script origin, so script-src needs neither 'unsafe-inline' nor an
 * external host. style-src keeps 'unsafe-inline' deliberately: the app has
 * many pre-existing style="" attributes with no JS-execution risk, so
 * hashing each one isn't worth the fragility for the threat this policy
 * targets (a script reading localStorage's JWT) — see
 * docs/instruction/B65-csp-va-third-party-script-bao-ve-jwt-localstorage.md.
 */
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
  imgSrc: ["'self'", 'data:'],
  mediaSrc: ["'self'", 'https://cdn.freesound.org', 'https://raw.githubusercontent.com'],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'self'"],
};

module.exports = { cspDirectives };
