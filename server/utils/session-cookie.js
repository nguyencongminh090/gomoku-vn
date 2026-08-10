'use strict';

/**
 * session-cookie.js — the ONE place that knows how the session cookie is
 * shaped (TODO.md #68).
 *
 * Everything about the cookie is here on purpose. Split across call sites,
 * the set and clear paths drift — and a clear that disagrees with the set on
 * Path or SameSite silently fails to delete anything, leaving a live session
 * cookie on a machine whose user believes they logged out.
 *
 * Attributes and why:
 *   HttpOnly            — the entire point: JS cannot read the credential.
 *   SameSite=Lax        — blocks the cross-site requests that would otherwise
 *                         carry this cookie (CSRF, and CSWSH on the socket
 *                         handshake). Lax rather than Strict so opening a
 *                         shared room link from a chat app still arrives
 *                         signed in; see planning.md Q3.
 *   Secure (derived)    — set only when the request actually arrived over
 *                         HTTPS. Hardcoding it true would make the cookie be
 *                         dropped in silence on http://localhost dev; hardcoding
 *                         it false would ship a cookie over plaintext in prod.
 *   Path=/              — the socket handshake and the pages are all under /.
 *   Max-Age             — mirrors the session row's TTL.
 */

const config = require('../config');

/**
 * Is this request on HTTPS?
 *
 * `req.secure` already accounts for X-Forwarded-Proto because index.js sets
 * `trust proxy: 'loopback'` — which is exactly right for the Cloudflare Tunnel
 * deployment, where the tunnel terminates TLS and reaches the app over
 * loopback. A client that could hit the port directly cannot spoof the header
 * into flipping this, since 'loopback' only honours it from loopback.
 */
function isSecureRequest(req) {
  return !!(req && req.secure);
}

/**
 * Attributes shared by set and clear — they MUST match or the clear no-ops.
 * @param {string} [path='/'] override for a cookie scoped narrower than the
 *   session cookie (e.g. auth.js's OAuth state cookie, scoped to
 *   /api/auth/google — see its own comment for why).
 */
function baseCookieOptions(req, path = '/') {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path,
  };
}

/**
 * Attach a session cookie to the response.
 * @param {number} ttlMs lifetime, mirroring the session row's expiry
 */
function setSessionCookie(req, res, sessionId, ttlMs) {
  res.cookie(config.SESSION_COOKIE_NAME, sessionId, {
    ...baseCookieOptions(req),
    maxAge: ttlMs,
  });
}

/**
 * Remove the session cookie. Revoking the row is a separate call and is the
 * part that actually ends the session — this only stops the browser from
 * re-sending a now-dead id.
 */
function clearSessionCookie(req, res) {
  res.clearCookie(config.SESSION_COOKIE_NAME, baseCookieOptions(req));
}

/**
 * Parse a Cookie header into a plain object.
 *
 * Hand-rolled rather than pulling in `cookie-parser`, because the caller that
 * matters most is the Socket.IO handshake — which is not an Express request
 * and so never passes through Express middleware at all. One parser used by
 * both paths beats an Express-only dependency plus a second ad-hoc parser for
 * sockets.
 *
 * Tolerates the malformed input a raw header can carry: missing '=',
 * duplicate names (first wins, matching browser precedence for same-path
 * cookies), stray whitespace, and undefined.
 */
function parseCookies(header) {
  const out = {};
  if (typeof header !== 'string' || header.length === 0) return out;

  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue; // no '=', or an empty name — skip, don't throw
    const name = part.slice(0, eq).trim();
    if (!name || Object.prototype.hasOwnProperty.call(out, name)) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      // A malformed percent-escape must not take down the handshake.
      out[name] = raw;
    }
  }
  return out;
}

/** Pull the session id out of a raw Cookie header, or null. */
function readSessionIdFromHeader(cookieHeader) {
  const cookies = parseCookies(cookieHeader);
  return cookies[config.SESSION_COOKIE_NAME] || null;
}

module.exports = {
  isSecureRequest,
  baseCookieOptions,
  setSessionCookie,
  clearSessionCookie,
  parseCookies,
  readSessionIdFromHeader,
};
