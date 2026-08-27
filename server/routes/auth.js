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
 *   [ ] Guest → isGuest: true and a `guest` + 4-digit displayName
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
const config  = require('../config');

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
  max: config.AUTH_LIMITER_MAX,
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
const logger  = require('../utils/logger');
const sessionManager = require('../managers/SessionManager');
const { setSessionCookie, clearSessionCookie, readSessionIdFromHeader, baseCookieOptions, parseCookies } = require('../utils/session-cookie');

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
//
// The cookie NAME embeds the state value itself (TODO.md #95) rather than
// being fixed — two /google requests from the same browser (2 tabs, or a
// double-click before the first consent screen loads) used to write the same
// fixed-name cookie and overwrite each other's state, so whichever flow's
// callback ran first would read the OTHER flow's state and fail with a false
// "oauth_state" error, then clear the cookie the second flow still needed.
// Naming each cookie after its own state value gives concurrent flows
// disjoint cookies — no shared slot to collide over — while keeping exactly
// the same security property: the callback only succeeds if a cookie named
// after the query string's `state` value is present, i.e. this exact browser
// is the one GET /google set it for.
const OAUTH_STATE_COOKIE_PREFIX = 'gvn_oauth_state_';
const OAUTH_STATE_COOKIE_PATH = '/api/auth/google';
// Matches exactly what `crypto.randomBytes(16).toString('hex')` below
// produces. The callback uses this to reject a malformed `state` query param
// BEFORE using it to build a cookie name to look up — an attacker-controlled
// query string must never flow unvalidated into a cookie-name lookup.
const OAUTH_STATE_RE = /^[a-f0-9]{32}$/;

/** The per-flow cookie name for a given state value. */
function oauthStateCookieName(state) {
  return OAUTH_STATE_COOKIE_PREFIX + state;
}

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

/**
 * Turn a Google profile's `name` into a usable display name (TODO.md #97),
 * or null if nothing usable is left.
 *
 * `isValidDisplayName()` above REJECTS a name outright the moment it contains
 * any forbidden character — right for the register form (a human typed it and
 * can be told to fix it), wrong here: nobody can "fix" what Google's account
 * profile says, and real names commonly carry one of these characters
 * (apostrophes — "O'Brien" — or "&", e.g. "Marks & Co"). Falling back to a
 * random guest name for those accounts silently threw away a good display
 * name instead of accepting the harmless part of it.
 *
 * So this strips exactly the forbidden set instead of rejecting on sight,
 * then re-validates the length of what's left — a name that becomes empty or
 * too short after stripping (e.g. was nothing but forbidden characters) still
 * has no usable name, and the caller falls back to generateGuestName() same
 * as before. Only used for the OAuth branch; isValidDisplayName() keeps its
 * reject-on-sight behavior for the register form unchanged.
 */
function sanitizeOAuthDisplayName(name) {
  if (typeof name !== 'string') return null;
  const stripped = name.replace(new RegExp(DISPLAY_NAME_FORBIDDEN, 'g'), '').trim();
  if (stripped.length < 2 || stripped.length > 24) return null;
  return stripped;
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

// How many times generateGuestName() re-rolls on a collision before giving up
// and returning the last candidate anyway. The name space is 10,000 wide and
// only live guest sessions count toward a collision, so hitting this limit
// needs thousands of guests online at once — at which point a rare duplicate
// display name is harmless (guestId, not the name, is the identity).
const GUEST_NAME_MAX_TRIES = 20;

/**
 * Generate a guest display name of the form `guest` + 4 digits, e.g.
 * "guest0473" (TODO.md #163). Leading zeros are kept so the name is always
 * exactly 9 characters.
 *
 * Re-rolls if the name is already held by another live guest session, so two
 * guests online together don't usually share a name. This is best-effort only:
 * the check sees the sessions table, not sockets, and after GUEST_NAME_MAX_TRIES
 * it returns the last candidate regardless.
 *
 * Also used as the fallback name for an OAuth sign-in whose profile has no
 * usable name — a `guestNNNN` string there is fine, it just isn't guest-only.
 */
function generateGuestName() {
  let candidate;
  for (let i = 0; i < GUEST_NAME_MAX_TRIES; i++) {
    candidate = 'guest' + String(crypto.randomInt(0, 10000)).padStart(4, '0');
    if (!sessionManager.isGuestDisplayNameInUse(candidate)) return candidate;
  }
  return candidate;
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
    // TODO.md #98: this route is reached via <a href>, the same full-page
    // navigation as /google/callback below — a JSON body here (the old
    // behavior) dumps raw, unstyled JSON in the browser with no way back
    // except the Back button, unlike every other OAuth failure, which lands
    // on login.html's own styled error banner. Route both through the same
    // place instead, with a message that says "not available" rather than
    // "try again" — this isn't something retrying fixes.
    return res.redirect('/login.html?error=oauth_not_configured');
  }

  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(oauthStateCookieName(state), '1', {
    ...baseCookieOptions(req, OAUTH_STATE_COOKIE_PATH),
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
    // Kept consistent with /google above (TODO.md #98) — same redirect, same
    // error code, same styled banner on login.html.
    return res.redirect('/login.html?error=oauth_not_configured');
  }

  // CSRF check first, before anything else touches the DB or Google's API.
  const { code, state } = req.query;
  const stateValid = typeof state === 'string' && OAUTH_STATE_RE.test(state);
  const cookieName = stateValid ? oauthStateCookieName(state) : null;
  const hasStateCookie = !!(cookieName && Object.prototype.hasOwnProperty.call(parseCookies(req.headers.cookie), cookieName));
  if (cookieName) res.clearCookie(cookieName, baseCookieOptions(req, OAUTH_STATE_COOKIE_PATH));

  if (!code || typeof code !== 'string' || !stateValid || !hasStateCookie) {
    // A missing state cookie has two very different causes that look
    // identical here: genuine CSRF/expiry, or this exact request being a
    // duplicate (network retry, or Back/Forward) of one that already
    // completed — the winning request already consumed and cleared this same
    // cookie (TODO.md #96). Google's `code` is single-use, so a duplicate
    // would otherwise hit `invalid_grant` below and redirect to
    // error=oauth_failed even though the user already has a valid session
    // from the first request. Detect that specific case — code/state look
    // fine, cookie is just already gone, AND this request already carries a
    // valid session cookie — and land on the signed-in destination instead of
    // an error a user who is, in fact, already logged in should never see.
    if (code && typeof code === 'string' && stateValid) {
      const existingSessionId = readSessionIdFromHeader(req.headers.cookie);
      if (existingSessionId && sessionManager.getValidSession(existingSessionId)) {
        logger.info('[Auth] Google OAuth callback: state cookie already consumed but a valid session exists — treating as a duplicate request, not an error');
        return res.redirect('/index.html');
      }
    }
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
      const displayName = sanitizeOAuthDisplayName(payload.name) || generateGuestName();
      // A real, unusable bcrypt hash — this account only ever authenticates
      // via Google, but password_hash stays NOT NULL for every row (see
      // schema.sql's comment on this table). Generated fresh per account,
      // unlike DUMMY_PASSWORD_HASH above, since nothing needs it to be
      // constant-time-comparable — it is never compared against anything.
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), config.BCRYPT_ROUNDS);

      // TOCTOU race (TODO.md #94): the getUserByOAuthId check above and this
      // insert straddle the `await bcrypt.hash()` above, so two concurrent
      // callbacks for the same brand-new Google account can both reach here.
      // idx_users_oauth is a UNIQUE index (database.js), so the loser throws
      // SQLITE_CONSTRAINT_UNIQUE here instead of silently creating a second
      // row — re-read the row the winner just created and continue with that
      // instead of falling through to the outer catch's oauth_failed error.
      try {
        db.createUser({
          id: userId,
          username,
          passwordHash,
          displayName,
          createdAt: now,
          oauthProvider: 'google',
          oauthId: payload.sub,
        });
        // TODO.md #102: no re-read here, unlike the race-loser branch below —
        // better-sqlite3 is synchronous and nothing else touches this row
        // between the insert above and here, so every field is already known
        // from this scope. The race-loser branch DOES need to re-read: it
        // lost, so this scope's values are not what actually landed in the row.
        user = {
          id: userId,
          username,
          display_name: displayName,
          created_at: now,
          oauth_provider: 'google',
          oauth_id: payload.sub,
        };
        logger.info(`[Auth] Created account via Google OAuth: ${username} (${userId})`);
      } catch (err) {
        if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE' && err.code !== 'SQLITE_CONSTRAINT') throw err;
        user = db.getUserByOAuthId('google', payload.sub);
        if (!user) throw err;
        logger.warn(`[Auth] Google OAuth callback: lost create race for sub ${payload.sub}, reusing winner's account (${user.id})`);
      }
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
