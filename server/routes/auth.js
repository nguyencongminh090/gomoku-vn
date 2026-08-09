'use strict';

/**
 * auth.js — REST authentication routes.
 *
 * POST /api/auth/register — create account, start a session
 * POST /api/auth/login    — verify credentials, start a session
 * POST /api/auth/guest    — ephemeral guest identity, start a session
 * POST /api/auth/logout   — revoke the session, clear the cookie
 * POST /api/auth/upgrade-session — trade a pre-#68 JWT for a session (migration)
 * GET  /api/auth/google          — redirect to Google's consent screen (TODO.md #91)
 * GET  /api/auth/google/callback — exchange code, find/create user, start a session
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
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { OAuth2Client } = require('google-auth-library');

const router  = express.Router();

// keyGenerator: express-rate-limit's default keys on req.ip, which behind
// this deployment's Cloudflare Tunnel resolves to the tunnel's own loopback
// address for every visitor — collapsing everyone into ONE shared 20-req/15m
// budget instead of one per real client (see get-client-ip.js's module
// comment for the incident this fixes: one device exhausting the budget
// broke login/logout for every other device, phone included). ipKeyGenerator()
// wraps the resolved IP per express-rate-limit v8's own documented pattern —
// without it, an IPv6 client could rotate within its own /56 to bypass the
// limit entirely.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => ipKeyGenerator(getClientIpFromReq(req) || ''),
});
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
const { setSessionCookie, clearSessionCookie, readSessionIdFromHeader, isSecureRequest, parseCookies } = require('../utils/session-cookie');

// Built once at module load, null when Google OAuth isn't configured for this
// environment (see config.js — GOOGLE_CLIENT_ID/SECRET are optional, unlike
// JWT_SECRET). The two routes below check for null and respond with a clear
// error instead of throwing. No redirectUri passed to the constructor —
// googleCallbackUrl(req) below supplies it per-request instead.
const googleClient = (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET)
  ? new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET)
  : null;

/**
 * The OAuth callback URL for THIS request's own origin, not a fixed config
 * value — see the comment on GOOGLE_CLIENT_ID/SECRET in config.js for why.
 * req.protocol/req.get('host') already honour X-Forwarded-Proto/Host behind
 * the Cloudflare Tunnel (index.js sets `trust proxy: 'loopback'`), so this
 * naturally produces http://localhost:3000/... for local testing and
 * https://<tunnel-domain>/... when reached through the tunnel — as long as
 * that exact origin is also registered as an authorized redirect URI in
 * Google Cloud Console (Google's own allowlist is what actually gates this;
 * an unregistered origin just gets redirect_uri_mismatch from Google).
 */
function googleCallbackUrl(req) {
  return `${req.protocol}://${req.get('host')}/api/auth/google/callback`;
}

// Short-lived cookie carrying the OAuth `state` value between GET /google and
// GET /google/callback, so the callback can confirm the code it received
// actually belongs to a flow this server started (CSRF protection on the
// OAuth redirect, same purpose as SameSite=Lax on the session cookie).
// Scoped to /api/auth/google (not '/') so it never rides along on ordinary
// requests. Separate from the session cookie entirely — it authenticates
// nothing about who the user is, only that this browser started this flow.
const OAUTH_STATE_COOKIE = 'gvn_oauth_state';
const OAUTH_STATE_COOKIE_PATH = '/api/auth/google';

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

/**
 * Generate a unique, isValidUsername-compliant username for a new OAuth
 * account, seeded from the provider profile's email local-part for
 * readability (e.g. "quangquy6975" -> "quangquy_a1b2c3"). Always suffixed
 * with a random hex chunk rather than retried on collision alone — an
 * unsuffixed base could collide with an existing password-account username
 * (usernames are one shared namespace), and the suffix makes that
 * astronomically unlikely without a retry loop needing to run more than once
 * in practice.
 */
function generateOAuthUsername(seed) {
  const cleaned = String(seed || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 10);
  const base = cleaned.length >= 2 ? cleaned : 'user';
  let candidate;
  do {
    candidate = `${base}_${crypto.randomBytes(4).toString('hex')}`.slice(0, 20);
  } while (db.getUserByUsername(candidate));
  return candidate;
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

// ---------------------------------------------------------------------------
// GET /api/auth/google  (TODO.md #91)
//
// A full-page navigation (not fetch/XHR — Google's consent screen cannot be
// shown inside an AJAX response), so this redirects the browser rather than
// returning JSON like every other route in this file.
// ---------------------------------------------------------------------------
router.get('/google', (req, res) => {
  if (!googleClient) {
    return res.status(503).json({
      error: 'Đăng nhập Google chưa được cấu hình trên máy chủ này.',
      code: 'OAUTH_NOT_CONFIGURED',
    });
  }

  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: OAUTH_STATE_COOKIE_PATH,
    maxAge: 5 * 60 * 1000, // 5 minutes — plenty for a consent-screen round trip
  });

  const url = googleClient.generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    redirect_uri: googleCallbackUrl(req),
  });
  return res.redirect(url);
});

// ---------------------------------------------------------------------------
// GET /api/auth/google/callback  (TODO.md #91)
//
// Also a browser navigation, so it cannot hand the new session back the way
// the AJAX routes above do (login.js reading a JSON body and calling
// GvnSession.setUser itself). Instead it redirects to a static landing page,
// oauth-complete.html, with the same non-secret `user` fields the other
// routes return — passed via URL FRAGMENT, not a query string, so they never
// reach this server or any proxy/access log; the fragment is client-JS-only.
// That page's script sets localStorage the same way onAuthSuccess() does and
// bounces to index.html. See client/js/oauth-complete.js.
// ---------------------------------------------------------------------------
router.get('/google/callback', async (req, res) => {
  if (!googleClient) {
    return res.status(503).send('Đăng nhập Google chưa được cấu hình trên máy chủ này.');
  }

  // CSRF check first, before anything else touches the DB or Google's API.
  const { code, state } = req.query;
  const expectedState = parseCookies(req.headers.cookie)[OAUTH_STATE_COOKIE];
  res.clearCookie(OAUTH_STATE_COOKIE, { path: OAUTH_STATE_COOKIE_PATH });

  if (!code || typeof code !== 'string' || !state || !expectedState || state !== expectedState) {
    logger.warn('[Auth] Google OAuth callback: missing/mismatched state');
    return res.redirect('/login.html?error=oauth_state');
  }

  try {
    const { tokens } = await googleClient.getToken({ code, redirect_uri: googleCallbackUrl(req) });
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.sub || !payload.email_verified) {
      logger.warn('[Auth] Google OAuth callback: unverified or missing profile');
      return res.redirect('/login.html?error=oauth_failed');
    }

    let user = db.getUserByOAuthId('google', payload.sub);
    if (!user) {
      const userId = uuidv4();
      const now = new Date().toISOString();
      const username = generateOAuthUsername(payload.email);
      const displayName = isValidDisplayName(payload.name) ? payload.name.trim() : generateGuestName();
      // A real, unusable bcrypt hash — this account only ever authenticates
      // via Google, but password_hash stays NOT NULL for every row (see
      // schema.sql's comment on this table). Generated fresh per account,
      // unlike DUMMY_PASSWORD_HASH above, since nothing needs it to be
      // constant-time-comparable — it is never compared against anything.
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), config.BCRYPT_ROUNDS);

      db.createUser({
        id: userId,
        username,
        passwordHash,
        displayName,
        createdAt: now,
        oauthProvider: 'google',
        oauthId: payload.sub,
      });
      user = db.getUserById(userId);
      logger.info(`[Auth] Created account via Google OAuth: ${username} (${userId})`);
    }

    db.updateLastLogin(user.id, new Date().toISOString());

    const body = startSession(req, res, {
      userId: user.id,
      displayName: user.display_name,
      isGuest: false,
    });

    logger.info(`[Auth] Google login: ${user.username} (${user.id})`);
    const userPayload = encodeURIComponent(JSON.stringify(body.user));
    return res.redirect(`/oauth-complete.html#${userPayload}`);

  } catch (err) {
    logger.error('[Auth] Google OAuth callback error:', err);
    return res.redirect('/login.html?error=oauth_failed');
  }
});

module.exports = router;
