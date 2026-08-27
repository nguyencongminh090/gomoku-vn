'use strict';

/**
 * auth.js — Authentication middleware.
 *
 * verifyToken(req, res, next)  — Express middleware: verifies a session cookie,
 *   attaches req.user on success.
 *
 * verifySocketToken(socket, next) — Socket.io middleware: checks Origin, then
 *   resolves the session cookie to an identity and attaches socket.user.
 *
 * Since TODO.md #68 identity comes from a row in the `sessions` table, not
 * from a signed token the client carries. That is what makes logout and
 * session:kicked actually end a session instead of merely closing a socket.
 */

const jwt    = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');
const { clientInfoFromSocket } = require('../utils/geo');
const sessionManager = require('../managers/SessionManager');
const { readSessionIdFromHeader } = require('../utils/session-cookie');

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

/**
 * Verifies the session cookie and attaches the identity to req.user.
 * Responds 401 if there is no valid session.
 *
 * ⚠ CSRF: this is currently mounted on NO route. The credential it reads is a
 * cookie, which the browser attaches automatically — so the first
 * state-changing route this is ever added to needs CSRF protection (an
 * anti-forgery token, or an equivalent Origin/Sec-Fetch-Site check). The
 * SameSite=Lax attribute set in utils/session-cookie.js blocks the usual
 * cross-site POST, but do not treat that single layer as the whole answer.
 * See features/jwt-httponly-cookie/planning.md Q4.
 */
function verifyToken(req, res, next) {
  const sessionId = readSessionIdFromHeader(req.headers.cookie);
  const session = sessionId ? sessionManager.getValidSession(sessionId) : null;

  if (!session) {
    return res.status(401).json({ error: 'Cần đăng nhập để thực hiện thao tác này.', code: 'AUTH_REQUIRED' });
  }

  req.user = session;
  next();
}

// ---------------------------------------------------------------------------
// Socket.io middleware
// ---------------------------------------------------------------------------

/**
 * Reject a handshake whose Origin is not ours — CSWSH defence.
 *
 * This became necessary the moment the credential moved into a cookie. While
 * the token lived in localStorage, a hostile page simply could not read it, so
 * it could not open a socket as the victim. A cookie, by contrast, the browser
 * attaches on its own.
 *
 * Socket.IO's `cors` option does NOT cover this: browsers do not apply CORS to
 * WebSocket connections at all, so a cors config that looks restrictive still
 * lets a cross-site WebSocket handshake through.
 *
 * Requests with no Origin header (native clients, curl, the load-test harness
 * in scripts/) are allowed: Origin is a browser-supplied header, and its
 * absence means no browser is being tricked into anything. The session cookie
 * still has to be valid regardless.
 */
function isAllowedOrigin(origin) {
  if (!origin) return true; // non-browser client — see comment above

  const configured = process.env.CORS_ORIGIN;
  if (configured) {
    return configured.split(',').map(o => o.trim()).filter(Boolean).includes(origin);
  }

  // No explicit allow-list configured. In production that is a
  // misconfiguration we refuse to paper over; in development the app is
  // served from localhost on an arbitrary port, so accept loopback only.
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
  } catch {
    return false; // unparseable Origin — not something a real browser sends
  }
}

/**
 * Resolves the session cookie sent with the handshake and attaches the
 * identity to socket.user. Calls next(new Error(...)) to reject.
 *
 * During the migration window this also accepts a legacy JWT in
 * handshake.auth.token, so tabs still open with a pre-#68 token are not
 * dropped mid-game. The cookie always wins when both are present — the
 * fallback must never be a way to bypass a revoked session. Remove the
 * fallback once the window closes (planning.md step 12); leaving it in place
 * permanently would undo the point of the change, since an attacker able to
 * run JS could then supply auth.token themselves.
 */
function verifySocketToken(socket, next) {
  const { ip, geo } = clientInfoFromSocket(socket);
  const origin = socket.handshake.headers && socket.handshake.headers.origin;
  if (!isAllowedOrigin(origin)) {
    logger.warn('[Auth] Socket handshake rejected: bad origin', { origin, ip, geo });
    return next(new Error('AUTH_ORIGIN'));
  }

  const cookieHeader = socket.handshake.headers && socket.handshake.headers.cookie;
  const sessionId = readSessionIdFromHeader(cookieHeader);

  if (sessionId) {
    const session = sessionManager.getValidSession(sessionId);
    if (session) {
      socket.user = session;
      socket.sessionId = session.sessionId;
      sessionManager.touchSession(session.sessionId);
      return next();
    }
    // A cookie was presented and it is dead (revoked, expired, unknown).
    // Do NOT fall through to the legacy token: falling through is exactly how
    // a revoked session would come back to life.
    logger.warn('[Auth] Socket rejected: session cookie not valid', { ip, geo });
    return next(new Error('AUTH_INVALID'));
  }

  // ── Legacy JWT fallback — migration window only ────────────────────────
  const legacyToken = socket.handshake.auth && socket.handshake.auth.token;
  if (!legacyToken) {
    logger.warn('[Auth] Socket connection without session', { ip, geo });
    return next(new Error('AUTH_REQUIRED'));
  }

  try {
    const payload = jwt.verify(legacyToken, config.JWT_SECRET);
    socket.user = {
      userId: payload.userId,
      displayName: payload.displayName,
      isGuest: !!payload.isGuest,
      sessionId: null, // no session row — nothing to revoke or touch
    };
    return next();
  } catch (err) {
    logger.warn('[Auth] Socket invalid legacy token', { err: err.message, ip, geo });
    return next(new Error('AUTH_INVALID'));
  }
}

module.exports = { verifyToken, verifySocketToken, isAllowedOrigin };
