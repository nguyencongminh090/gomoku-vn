'use strict';

/**
 * auth.js — REST authentication routes.
 *
 * POST /api/auth/register — create account, start a session
 * POST /api/auth/login    — verify credentials, start a session
 * POST /api/auth/guest    — ephemeral guest identity, start a session
 * POST /api/auth/logout   — revoke the session, clear the cookie
 * POST /api/auth/upgrade-session — trade a pre-#68 JWT for a session (migration)
 *
 * Since TODO.md #68 these routes no longer hand a credential to JavaScript.
 * The session id goes out ONLY in a Set-Cookie header (HttpOnly), and the
 * response body carries just non-secret profile fields for the UI to show.
 * Anything that puts the session id back in the body would undo the whole
 * change, so a test pins that it never appears there.
 *
 * Manual test checklist:
 *   [ ] Register with valid username → Set-Cookie, no credential in the body
 *   [ ] Register with duplicate username → 409 + Vietnamese error
 *   [ ] Register with short username (<3) → 400
 *   [ ] Login with correct password → Set-Cookie
 *   [ ] Login with wrong password → 401 + Vietnamese error
 *   [ ] Guest → isGuest: true and a 4-8 letter displayName
 *   [ ] Logout → session unusable afterwards, not merely cookie-cleared
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const router  = express.Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
router.use(authLimiter);

// Responses here carry a fresh session cookie — never let a proxy/browser
// cache them. Kept from TODO.md #66; it matters MORE now, since a cached
// response would replay a Set-Cookie rather than just a body value.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
const db      = require('../db/database');
const config  = require('../config');
const logger  = require('../utils/logger');
const sessionManager = require('../managers/SessionManager');
const { setSessionCookie, clearSessionCookie, readSessionIdFromHeader } = require('../utils/session-cookie');

// A fixed, real bcrypt hash compared against when the submitted username does
// not exist, so that branch costs the same as a wrong-password branch instead
// of returning immediately. Without it, login response time alone tells an
// attacker whether an account exists (measured before this fix: 1.1ms for an
// unknown user vs 206ms for a known one — a 188x difference).
//
// It is hardcoded on purpose. Generating it at startup (hashing a random or
// empty string) would make the dummy comparison's cost depend on how it was
// produced, which is the timing variance this is meant to remove. Its cost
// factor is 12, matching config.BCRYPT_ROUNDS — a test asserts they stay in
// sync, since a mismatch would silently reintroduce the difference.
// The plaintext behind it is irrelevant and matches no real password.
const DUMMY_PASSWORD_HASH = '$2b$12$eUr5s4pTKi0RtLu1yZOW8OcojkmfCDTKHECx1T910kJMAcfsOjK9O';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Validate username: 3-20 chars, alphanumeric + underscore only. */
function isValidUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9_]{3,20}$/.test(u);
}

// Characters a display name may never contain: the five that are significant
// in HTML/attribute/JS-string contexts, plus C0/C1 control characters (which
// includes newlines and other invisible formatting).
//
// This is defence in depth, not the thing that stops XSS — every client render
// path already escapes (`escapeHtml`/`escapeAttr`/`escapeJsString`) and stays
// that way. This is a second layer at the source, so a future render site that
// forgets to escape does not become exploitable through a stored name.
//
// Deliberately a **deny-list, not an ASCII allow-list**: display names are real
// people's names, and this app's users are Vietnamese — `[a-zA-Z0-9 ]+` would
// reject most of them ("Nguyễn Văn A"). Anything not on this list, accented
// Vietnamese included, still goes through (instruction.md §B32).
const DISPLAY_NAME_FORBIDDEN = /[<>&"']|[\u0000-\u001F\u007F-\u009F]/;

/** Validate display name: 2-24 chars, no HTML-significant or control chars. */
function isValidDisplayName(d) {
  if (typeof d !== 'string') return false;
  const trimmed = d.trim();
  if (trimmed.length < 2 || trimmed.length > 24) return false;
  return !DISPLAY_NAME_FORBIDDEN.test(trimmed);
}

/** Validate password: minimum 6 characters. */
function isValidPassword(p) {
  return typeof p === 'string' && p.length >= 6;
}

/**
 * Start a session and attach its cookie, then return the body the client gets.
 *
 * The returned object is deliberately the ONLY thing these routes send back:
 * non-secret profile fields the UI needs to render, and nothing that could be
 * replayed as a credential. `session.id` stays in the Set-Cookie header.
 */
function startSession(req, res, { userId, displayName, isGuest }, opts) {
  const session = sessionManager.createSession({ userId, displayName, isGuest }, opts);
  setSessionCookie(req, res, session.id, session.ttlMs);
  return {
    user: {
      userId,
      displayName,
      isGuest,
      expiresAt: session.expiresAt,
    },
    displayName, // kept for compatibility with the existing login.js contract
  };
}

/** Generate a random guest display name (4-8 letters). */
function generateGuestName() {
  const adj  = config.GUEST_NAME_ADJECTIVES;
  const noun = config.GUEST_NAME_NOUNS;
  const a = adj[Math.floor(Math.random() * adj.length)];
  const n = noun[Math.floor(Math.random() * noun.length)];
  // e.g. "WildFox" (3+3=6), "NeonBear" (4+4=8)
  return a + n;
}

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
router.post('/register', async (req, res, next) => {
  try {
    const { username, password, displayName } = req.body;

    if (!isValidUsername(username)) {
      return res.status(400).json({
        error: 'Tên đăng nhập phải từ 3-20 ký tự, chỉ gồm chữ cái, số và dấu gạch dưới.',
        code: 'USERNAME_INVALID',
      });
    }
    if (!isValidDisplayName(displayName)) {
      return res.status(400).json({
        error: 'Tên hiển thị phải từ 2-24 ký tự, không chứa < > & " \' hoặc ký tự điều khiển.',
        code: 'DISPLAY_NAME_INVALID',
      });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({
        error: 'Mật khẩu phải có ít nhất 6 ký tự.',
        code: 'PASSWORD_TOO_SHORT',
      });
    }

    // Check uniqueness
    const existing = db.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({
        error: 'Tên đăng nhập đã tồn tại. Vui lòng chọn tên khác.',
        code: 'USERNAME_TAKEN',
      });
    }

    const passwordHash = await bcrypt.hash(password, config.BCRYPT_ROUNDS);
    const userId       = uuidv4();
    const now          = new Date().toISOString();

    db.createUser({
      id: userId,
      username,
      passwordHash,
      displayName: displayName.trim(),
      createdAt: now,
    });

    const body = startSession(req, res, {
      userId,
      displayName: displayName.trim(),
      isGuest: false,
    });

    logger.info(`[Auth] Registered user: ${username} (${userId})`);
    return res.status(201).json(body);

  } catch (err) {
    logger.error('[Auth] Register error:', err);
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Vui lòng nhập tên đăng nhập và mật khẩu.',
        code: 'MISSING_CREDENTIALS',
      });
    }

    const user = db.getUserByUsername(username);

    // Always run one bcrypt.compare, whether or not the account exists — see
    // DUMMY_PASSWORD_HASH above. The unknown-user branch compares against the
    // dummy and then fails on `!user`, so both paths do the same work and
    // return the same message.
    const match = await bcrypt.compare(password, user ? user.password_hash : DUMMY_PASSWORD_HASH);
    if (!user || !match) {
      return res.status(401).json({
        error: 'Tên đăng nhập hoặc mật khẩu không đúng.',
        code: 'INVALID_CREDENTIALS',
      });
    }

    db.updateLastLogin(user.id, new Date().toISOString());

    const body = startSession(req, res, {
      userId: user.id,
      displayName: user.display_name,
      isGuest: false,
    });

    logger.info(`[Auth] Login: ${username}`);
    return res.json(body);

  } catch (err) {
    logger.error('[Auth] Login error:', err);
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/guest
// ---------------------------------------------------------------------------
router.post('/guest', (req, res, next) => {
  try {
    // Generate unique guest ID (not persisted)
    const guestId      = 'guest_' + uuidv4().slice(0, 8);
    const displayName  = generateGuestName();

    const body = startSession(req, res, {
      userId: guestId,
      displayName,
      isGuest: true,
    });

    logger.info(`[Auth] Guest session: ${displayName} (${guestId})`);
    return res.json(body);

  } catch (err) {
    logger.error('[Auth] Guest error:', err);
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
//
// New with TODO.md #68. Logging out used to be a pure client-side
// localStorage.removeItem, which cannot work once the credential is HttpOnly —
// and, more importantly, never actually ended anything server-side.
//
// Order matters: revoke the row FIRST, then clear the cookie. Revocation is
// what ends the session; clearing the cookie only stops the browser resending
// a dead id. Doing it the other way round would leave a live session behind if
// the response never reached the client.
// ---------------------------------------------------------------------------
router.post('/logout', (req, res, next) => {
  try {
    const sessionId = readSessionIdFromHeader(req.headers.cookie);
    if (sessionId) sessionManager.revokeSession(sessionId);
    clearSessionCookie(req, res);
    // 204 whether or not a session was found: "log me out" is satisfied either
    // way, and reporting which ids exist would leak session-id validity.
    return res.status(204).end();
  } catch (err) {
    logger.error('[Auth] Logout error:', err);
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/upgrade-session  — TIME-BOXED MIGRATION, delete after the
// transition window (features/jwt-httponly-cookie/planning.md step 12).
//
// When #68 shipped, users were holding JWTs in localStorage valid for up to 7
// more days (24h for guests). Switching the server to sessions-only would have
// signed all of them out at once — and a guest signed out is a guest whose
// identity is gone for good, since there is no account to log back into.
//
// This trades such a token for a real session. It deliberately preserves the
// old token's REMAINING lifetime instead of granting a fresh TTL: a migration
// should move a session, not silently extend everyone's.
// ---------------------------------------------------------------------------
router.post('/upgrade-session', (req, res, next) => {
  try {
    const token = req.body && req.body.token;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Thiếu token.', code: 'MISSING_TOKEN' });
    }

    let payload;
    try {
      payload = jwt.verify(token, config.JWT_SECRET);
    } catch {
      // Expired or forged — nothing to migrate. Client falls back to login.
      return res.status(401).json({
        error: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.',
        code: 'AUTH_INVALID_TOKEN',
      });
    }

    // `exp` is in seconds. Anything already past is rejected above by verify(),
    // so this is always positive here, but clamp anyway rather than trust it.
    const remainingMs = Math.max(0, (payload.exp * 1000) - Date.now());
    if (remainingMs === 0) {
      return res.status(401).json({
        error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
        code: 'AUTH_INVALID_TOKEN',
      });
    }

    const body = startSession(req, res, {
      userId: payload.userId,
      displayName: payload.displayName,
      isGuest: !!payload.isGuest,
    }, { ttlMs: remainingMs });

    logger.info(`[Auth] Upgraded legacy token → session: ${payload.displayName} (${payload.userId})`);
    return res.json(body);
  } catch (err) {
    logger.error('[Auth] Upgrade-session error:', err);
    return next(err);
  }
});

module.exports = router;
