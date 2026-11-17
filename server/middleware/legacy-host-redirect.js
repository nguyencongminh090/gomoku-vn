'use strict';

/**
 * legacy-host-redirect.js — move browsers from an old public hostname to the canonical one.
 *
 * An installed PWA is bound to the origin it was installed from, so users who installed from the old
 * domain can't be re-pointed. When they open it, the page navigation is sent (302) to the same path on
 * the canonical origin, which then offers the install banner again.
 *
 * Config (both required, else a no-op):  LEGACY_HOSTS=old.example,other.example   CANONICAL_ORIGIN=https://new.example
 * Only document navigations (GET/HEAD) are redirected. Left alone on the old host so already-open pages
 * keep working: /api, /socket.io, /oauth-complete.html (a login started there must finish there) and
 * every non-HTML request (assets, sw.js, manifest).
 */

const KEEP = ['/api/', '/socket.io/', '/oauth-complete.html'];

function parseHosts(v) {
  return String(v || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}

function isDocumentRequest(req) {
  const dest = req.headers['sec-fetch-dest'];
  if (dest) return dest === 'document';
  return String(req.headers.accept || '').includes('text/html');
}

function legacyHostRedirect({ hosts, canonical } = {}) {
  const legacy = new Set(parseHosts(hosts));
  const base = String(canonical || '').replace(/\/+$/, '');
  if (!legacy.size || !/^https?:\/\//.test(base)) return (req, res, next) => next();
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
    if (!legacy.has(host)) return next();
    const url = req.originalUrl || req.url;
    if (KEEP.some((p) => url === p.replace(/\/$/, '') || url.startsWith(p))) return next();
    if (!isDocumentRequest(req)) return next();
    return res.redirect(302, base + url);
  };
}

module.exports = { legacyHostRedirect };
