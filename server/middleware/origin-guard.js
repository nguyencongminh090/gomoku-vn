'use strict';

/**
 * origin-guard.js — second CSRF layer for cookie-authenticated /api writes (#350).
 *
 * SameSite=Lax already keeps the session cookie off cross-site POSTs in current
 * browsers; this rejects the request itself, so an older browser or a same-site
 * sibling origin cannot ride the cookie either.
 *
 * Non-safe methods only. A request passes when:
 *   - it has an Origin whose host is this server's Host header (the Cloudflare
 *     tunnel forwards the public Host) or is listed in CORS_ORIGIN; or
 *   - it has no Origin and its Sec-Fetch-Site is absent, same-origin or none.
 * Header-less clients (curl, tests, load harness) are not browsers being tricked,
 * the same reasoning as socket handshakes in auth.js.
 */

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowedList() {
  return (process.env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
}

function originOk(origin, host) {
  if (allowedList().includes(origin)) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}

function originGuard(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  const ok = origin
    ? originOk(origin, req.headers.host)
    : (!site || site === 'same-origin' || site === 'none');
  if (ok) return next();
  return res.status(403).json({ error: 'Yêu cầu từ trang khác bị từ chối.', code: 'CROSS_SITE_BLOCKED' });
}

module.exports = { originGuard };
