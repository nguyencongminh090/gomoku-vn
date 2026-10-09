'use strict';

/**
 * profile.js — public profile + avatar (#177).
 *
 * GET    /api/profile/:username       — public profile (privacy opt-outs honoured)
 * PUT    /api/profile                 — edit own bio / privacy flags
 * POST   /api/profile/avatar          — upload (raw image body), re-encoded to WebP
 * DELETE /api/profile/avatar          — remove
 * GET    /api/profile/avatar/:id.webp — serve (immutable; URL carries ?v=)
 *
 * Avatars are never stored as uploaded: sharp decodes, rotates, centre-crops to
 * AVATAR_SIZE² and re-encodes to WebP, so stored bytes are ours (no EXIF, no
 * polyglots, ≤ AVATAR_MAX_BYTES). One file per user, overwritten in place.
 */

const fs = require('fs');
const path = require('path');
const express = require('express');
const sharp = require('sharp');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { readSessionIdFromHeader } = require('../utils/session-cookie');
const sessionManager = require('../managers/SessionManager');
const database = require('../db/database');
const { verifyToken } = require('../middleware/auth');
const { CATEGORIES, PROVISIONAL_RD } = require('../managers/RatingService');

const AVATAR_DIR = process.env.AVATAR_DIR || path.join(__dirname, '..', 'data', 'avatars');
const AVATAR_SIZE = 256;
const AVATAR_MAX_INPUT = 2 * 1024 * 1024;
const AVATAR_MAX_BYTES = 30 * 1024;
const AVATAR_QUALITY_STEPS = [70, 55, 40, 25];
const MAX_INPUT_PIXELS = 24e6;
const BIO_MAX = 280;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const UUID_RE = /^[0-9a-f-]{36}$/i;

const router = express.Router();

const keyGenerator = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, keyGenerator }));
const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, keyGenerator });

function avatarFile(userId) {
  return path.join(AVATAR_DIR, `${userId}.webp`);
}

function avatarUrl(user) {
  return user.avatar_v ? `/api/profile/avatar/${user.id}.webp?v=${user.avatar_v}` : null;
}

/** Session user id, or null — never rejects (the profile page is public). */
function optionalUserId(req) {
  const sid = readSessionIdFromHeader(req.headers.cookie);
  const session = sid ? sessionManager.getValidSession(sid) : null;
  return (session && session.userId) || null;
}

function requireMember(req, res, next) {
  if (!req.user.userId) {
    return res.status(403).json({ error: 'Khách không có hồ sơ.', code: 'GUEST_FORBIDDEN' });
  }
  next();
}

// Static path first so "avatar" is never read as a username.
router.get('/avatar/:file', (req, res) => {
  const m = /^(.+)\.webp$/.exec(req.params.file);
  if (!m || !UUID_RE.test(m[1])) return res.status(404).end();
  const file = avatarFile(m[1]);
  if (!fs.existsSync(file)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('image/webp').sendFile(file);
});

router.post('/avatar', verifyToken, requireMember, writeLimiter,
  express.raw({ type: () => true, limit: AVATAR_MAX_INPUT }),
  async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Thiếu ảnh.', code: 'AVATAR_EMPTY' });
      }
      let out;
      try {
        const img = sharp(req.body, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
        const meta = await img.metadata();
        if (!ALLOWED_FORMATS.has(meta.format)) {
          return res.status(415).json({ error: 'Chỉ nhận ảnh JPEG, PNG hoặc WebP.', code: 'AVATAR_TYPE' });
        }
        const base = img.rotate().resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' });
        for (const quality of AVATAR_QUALITY_STEPS) {
          out = await base.clone().webp({ quality }).toBuffer(); // metadata stripped by default
          if (out.length <= AVATAR_MAX_BYTES) break;
        }
      } catch (_) {
        return res.status(415).json({ error: 'Ảnh không hợp lệ.', code: 'AVATAR_INVALID' });
      }
      fs.mkdirSync(AVATAR_DIR, { recursive: true });
      const target = avatarFile(req.user.userId);
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, out);
      fs.renameSync(tmp, target);
      const v = database.setAvatarVersion(req.user.userId, false);
      res.json({ avatarUrl: `/api/profile/avatar/${req.user.userId}.webp?v=${v}`, bytes: out.length });
    } catch (err) {
      next(err);
    }
  });

router.delete('/avatar', verifyToken, requireMember, writeLimiter, (req, res, next) => {
  try {
    fs.rmSync(avatarFile(req.user.userId), { force: true });
    database.setAvatarVersion(req.user.userId, true);
    res.json({ avatarUrl: null });
  } catch (err) {
    next(err);
  }
});

router.put('/', verifyToken, requireMember, writeLimiter, express.json({ limit: '4kb' }), (req, res, next) => {
  try {
    const b = req.body || {};
    const patch = {};
    if (b.bio !== undefined) {
      if (typeof b.bio !== 'string' || b.bio.length > BIO_MAX) {
        return res.status(400).json({ error: `Giới thiệu tối đa ${BIO_MAX} ký tự.`, code: 'BIO_INVALID' });
      }
      patch.bio = b.bio.trim();
    }
    for (const k of ['hideHistory', 'hideBio']) {
      if (b[k] === undefined) continue;
      if (typeof b[k] !== 'boolean') return res.status(400).json({ error: 'Giá trị không hợp lệ.', code: 'PRIVACY_INVALID' });
      patch[k === 'hideHistory' ? 'hide_history' : 'hide_bio'] = b[k];
    }
    database.updateProfile(req.user.userId, patch);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:username', (req, res, next) => {
  try {
    const user = database.getProfileByUsername(String(req.params.username).slice(0, 40));
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người chơi.', code: 'PROFILE_NOT_FOUND' });

    const isSelf = optionalUserId(req) === user.id;
    const showHistory = isSelf || !user.hide_history;

    const ratings = [];
    for (const category of CATEGORIES) {
      const r = database.getUserRanking(user.id, category);
      if (r) {
        ratings.push({ category, rating: Math.round(r.rating), rank: r.rank, games: r.games, provisional: r.rd > PROVISIONAL_RD });
      }
    }

    let stats = null;
    let recent = [];
    if (showHistory) {
      const s = database.getUserGameStats(user.id);
      stats = { games: s.games, wins: s.wins || 0, draws: s.draws || 0 };
      recent = database.getUserRecentGames(user.id, 10).map((g) => {
        const black = g.black_player_id === user.id;
        const result = g.winner === 'draw' ? 'draw'
          : (g.winner === 'BLACK') === black && (g.winner === 'BLACK' || g.winner === 'WHITE') ? 'win' : 'loss';
        return { id: g.id, opponent: black ? g.white_player_name : g.black_player_name, result, endedAt: g.ended_at };
      });
    }

    const body = {
      username: user.username,
      displayName: user.display_name,
      createdAt: user.created_at,
      avatarUrl: avatarUrl(user),
      bio: isSelf || !user.hide_bio ? user.bio : null,
      ratings,
      stats,
      recent,
      isSelf,
    };
    if (isSelf) body.privacy = { hideHistory: !!user.hide_history, hideBio: !!user.hide_bio };
    res.set('Cache-Control', 'no-store');
    res.json(body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
