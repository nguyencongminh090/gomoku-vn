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

/**
 * Engine worker only (#405): a dedicated worker created from a same-origin URL runs under the CSP of ITS OWN
 * response, so the WASM compile permission ('wasm-unsafe-eval') and the blob: glue script stay scoped to
 * /js/engine/engine.worker.js. Page CSP is unchanged. The engine files are fetched by the page
 * (connect-src 'self') and handed to the worker as buffers, so the worker needs no network at all.
 */
const ENGINE_WORKER_PATH = '/js/engine/engine.worker.js';
const ENGINE_WORKER_CSP = "default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; connect-src 'none'";

/**
 * Cross-origin isolation, opt-in per page (#408). The multi-thread engine needs SharedArrayBuffer, which only a
 * cross-origin isolated page gets: COOP same-origin (helmet already sends it site-wide) + COEP require-corp.
 * COEP blocks every cross-origin subresource without CORP/CORS (e.g. the edge-injected Cloudflare beacon), so it is
 * never site-wide: only the HTML paths listed in ENGINE_ISOLATED_PAGES. `require-corp`, not `credentialless`:
 * Safari has no credentialless. The engine worker always carries COEP so an isolated page may create it.
 */
const ENGINE_COEP = 'require-corp';

/** 'a.html, /b.html' → Set{'/a.html','/b.html'} */
function parseIsolatedPages(raw) {
  return new Set(String(raw || '').split(',').map((p) => p.trim()).filter(Boolean).map((p) => (p.startsWith('/') ? p : `/${p}`)));
}

/** Express middleware: COEP on the listed pages and on the engine worker script. */
function isolationMiddleware(pages) {
  return (req, res, next) => {
    if (req.path === ENGINE_WORKER_PATH || pages.has(req.path)) {
      res.setHeader('Cross-Origin-Embedder-Policy', ENGINE_COEP);
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    }
    next();
  };
}

module.exports = {
  cspDirectives, CF_INSIGHTS_SCRIPT, CF_INSIGHTS_REPORT, ENGINE_WORKER_PATH, ENGINE_WORKER_CSP,
  ENGINE_COEP, parseIsolatedPages, isolationMiddleware,
};
