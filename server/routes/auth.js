'use strict';

/**
 * auth.js — REST authentication routes.
 *
 * POST /api/auth/register  — create account, return JWT
 * POST /api/auth/login     — verify credentials, return JWT
 * POST /api/auth/guest     — generate ephemeral guest session, return JWT
 *
 * Manual test checklist:
 *   [ ] Register with valid username → returns token
 *   [ ] Register with duplicate username → 409 + Vietnamese error
 *   [ ] Register with short username (<3) → 400
 *   [ ] Login with correct password → returns token
 *   [ ] Login with wrong password → 401 + Vietnamese error
 *   [ ] Guest → returns token with isGuest: true and a 4-8 letter displayName
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const router  = express.Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
router.use(authLimiter);

// Responses here carry a fresh JWT — never let a proxy/browser cache them.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
const db      = require('../db/database');
const config  = require('../config');
const logger  = require('../utils/logger');

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

/** Sign a JWT for a user (registered or guest). */
function signToken(payload, expiry) {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: expiry });
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

    const token = signToken(
      { userId, username, displayName: displayName.trim(), isGuest: false },
      config.JWT_EXPIRY
    );

    logger.info(`[Auth] Registered user: ${username} (${userId})`);
    return res.status(201).json({ token, displayName: displayName.trim() });

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

    const token = signToken(
      {
        userId: user.id,
        username: user.username,
        displayName: user.display_name,
        isGuest: false,
      },
      config.JWT_EXPIRY
    );

    logger.info(`[Auth] Login: ${username}`);
    return res.json({ token, displayName: user.display_name });

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

    const token = signToken(
      {
        userId: guestId,
        username: guestId,
        displayName,
        isGuest: true,
      },
      config.JWT_GUEST_EXPIRY
    );

    logger.info(`[Auth] Guest session: ${displayName} (${guestId})`);
    return res.json({ token, displayName });

  } catch (err) {
    logger.error('[Auth] Guest error:', err);
    return next(err);
  }
});

module.exports = router;
