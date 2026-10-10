'use strict';

/**
 * profile.js — public profile + avatar (#177).
 *
 * GET    /api/profile/:username       — public profile (privacy opt-outs honoured)
 * PUT    /api/profile                 — edit own bio / privacy flags / uiSkin
 * GET    /api/profile/prefs           — own UI preferences (uiSkin)
 * POST   /api/profile/avatar          — upload (raw image body), re-encoded to WebP
 * DELETE /api/profile/avatar          — remove
 * GET    /api/profile/:username/rating-history?category=&days= — rating curve (privacy-aware)
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
const { optionalUserId } = require('../utils/optional-user');
const clubService = require('../managers/ClubService');
const puzzleService = require('../managers/PuzzleService');
const friendService = require('../managers/FriendService');
const privacyGate = require('../managers/PrivacyGate');
const achievements = require('../managers/Achievements');
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
const SKINS = ['arena', 'zen', 'bento'];
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

const CITY_MAX = 40;
const AUDIENCES = ['everyone', 'friends', 'nobody'];
function privacyOf(u) {
  return {
    hideHistory: !!u.hide_history, hideBio: !!u.hide_bio, hideOnline: !!u.hide_online,
    country: u.country, city: u.city,
    whoCanDm: u.who_can_dm, whoCanChallenge: u.who_can_challenge, whoCanFriend: u.who_can_friend,
  };
}

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
    if (b.uiSkin !== undefined) {
      if (!SKINS.includes(b.uiSkin)) return res.status(400).json({ error: 'Giao diện không hợp lệ.', code: 'SKIN_INVALID' });
      patch.ui_skin = b.uiSkin;
    }
    for (const k of ['hideHistory', 'hideBio']) {
      if (b[k] === undefined) continue;
      if (typeof b[k] !== 'boolean') return res.status(400).json({ error: 'Giá trị không hợp lệ.', code: 'PRIVACY_INVALID' });
      patch[k === 'hideHistory' ? 'hide_history' : 'hide_bio'] = b[k];
    }
    if (b.country !== undefined) {
      if (typeof b.country !== 'string' || !/^([A-Z]{2})?$/.test(b.country)) {
        return res.status(400).json({ error: 'Quốc gia không hợp lệ.', code: 'COUNTRY_INVALID' });
      }
      patch.country = b.country;
    }
    if (b.city !== undefined) {
      // eslint-disable-next-line no-control-regex
      if (typeof b.city !== 'string' || b.city.trim().length > CITY_MAX || /[\u0000-\u001f<>]/.test(b.city)) {
        return res.status(400).json({ error: `Thành phố tối đa ${CITY_MAX} ký tự.`, code: 'CITY_INVALID' });
      }
      patch.city = b.city.trim();
    }
    for (const [k, col] of [['whoCanDm', 'who_can_dm'], ['whoCanChallenge', 'who_can_challenge'], ['whoCanFriend', 'who_can_friend']]) {
      if (b[k] === undefined) continue;
      if (!AUDIENCES.includes(b[k])) return res.status(400).json({ error: 'Giá trị không hợp lệ.', code: 'AUDIENCE_INVALID' });
      patch[col] = b[k];
    }
    if (b.hideOnline !== undefined) {
      if (typeof b.hideOnline !== 'boolean') return res.status(400).json({ error: 'Giá trị không hợp lệ.', code: 'PRIVACY_INVALID' });
      patch.hide_online = b.hideOnline;
    }
    database.updateProfile(req.user.userId, patch);
    if (patch.hide_online !== undefined) require('../socket/state').setHideOnline(req.user.userId, patch.hide_online);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Own preferences (device-independent UI settings). Static path before /:username.
router.get('/prefs', verifyToken, requireMember, (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const u = database.getProfileById(req.user.userId);
    res.json({ uiSkin: database.getUiSkin(req.user.userId) || SKINS[0], ...(u ? privacyOf(u) : {}) });
  } catch (err) {
    next(err);
  }
});

const GAMES_PAGE = 10;

/** One finished game as the profile history shows it, from `userId`'s point of view. */
function gameRow(g, userId) {
  const black = g.black_player_id === userId;
  const result = g.winner === 'draw' ? 'draw'
    : (g.winner === 'BLACK') === black && (g.winner === 'BLACK' || g.winner === 'WHITE') ? 'win' : 'loss';
  return { id: g.id, opponent: black ? g.white_player_name : g.black_player_name, result, endedAt: g.ended_at };
}

// Paginated game history for the profile (B202). Same privacy switch as the profile's game list:
// hidden → only the owner sees it.
router.get('/:username/games', (req, res, next) => {
  try {
    const user = database.getProfileByUsername(String(req.params.username).slice(0, 40));
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người chơi.', code: 'PROFILE_NOT_FOUND' });
    res.set('Cache-Control', 'no-store');
    if (user.hide_history && optionalUserId(req) !== user.id) {
      return res.status(403).json({ error: 'Người chơi ẩn lịch sử ván.', code: 'HISTORY_HIDDEN' });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const total = database.getUserGameStats(user.id).games;
    const games = database.getUserRecentGames(user.id, GAMES_PAGE, (page - 1) * GAMES_PAGE).map((g) => gameRow(g, user.id));
    res.json({ games, pagination: { page, limit: GAMES_PAGE, total, totalPages: Math.ceil(total / GAMES_PAGE) } });
  } catch (err) {
    next(err);
  }
});

// Rating curve for the profile chart. Same privacy switch as the game list.
router.get('/:username/rating-history', (req, res, next) => {
  try {
    const user = database.getProfileByUsername(String(req.params.username).slice(0, 40));
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người chơi.', code: 'PROFILE_NOT_FOUND' });
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : CATEGORIES[0];
    const days = Math.min(365, Math.max(7, parseInt(req.query.days, 10) || 90));
    res.set('Cache-Control', 'no-store');
    if (user.hide_history && optionalUserId(req) !== user.id) {
      return res.json({ category, days, hidden: true, points: [], peak: null });
    }
    res.json({ category, days, hidden: false, ...database.getRatingSeries(user.id, category, days) });
  } catch (err) {
    next(err);
  }
});

router.get('/:username', (req, res, next) => {
  try {
    const user = database.getProfileByUsername(String(req.params.username).slice(0, 40));
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người chơi.', code: 'PROFILE_NOT_FOUND' });

    const viewerId = optionalUserId(req);
    const isSelf = viewerId === user.id;
    const showHistory = isSelf || !user.hide_history;

    const ratings = [];
    for (const category of CATEGORIES) {
      const r = database.getUserRanking(user.id, category);
      if (r) {
        ratings.push({
          category, rating: Math.round(r.rating), rank: r.rank, games: r.games, provisional: r.rd > PROVISIONAL_RD,
          // Recent activity is part of the game history the owner may hide.
          delta7: showHistory ? Math.round(database.getRatingDeltas7(category, [user.id]).get(user.id) || 0) : null,
        });
      }
    }

    let stats = null;
    let recent = [];
    if (showHistory) {
      const s = database.getUserGameStats(user.id);
      stats = { games: s.games, wins: s.wins || 0, draws: s.draws || 0 };
      recent = database.getUserRecentGames(user.id, GAMES_PAGE).map((g) => gameRow(g, user.id));
    }

    // Rated-games streak + badges (#199). Win-based parts follow hide_history; rank badges are public.
    const ranks = ratings.map((r) => r.rank).filter((r) => r != null);
    const bestRank = ranks.length ? Math.min(...ranks) : null;
    const streak = showHistory ? achievements.streaks(database.getUserRankedResults(user.id, achievements.STREAK_WINDOW)) : null;
    const badges = achievements.badges(
      { rankedWins: showHistory ? database.countUserRankedWins(user.id) : 0, bestRank },
      { showHistory }
    );

    const body = {
      username: user.username,
      displayName: user.display_name,
      createdAt: user.created_at,
      avatarUrl: avatarUrl(user),
      bio: isSelf || !user.hide_bio ? user.bio : null,
      country: user.country || '',
      city: user.city || '',
      ratings,
      stats,
      streak,
      badges,
      puzzles: puzzleService.statsFor(user.id), // public: solving is not part of the hideable game history
      recent,
      clubs: clubService.clubsOfUser(user.id),
      isSelf,
      friendship: friendService.statusBetween(viewerId, user.id),
    };
    // What the viewer may do to this user (members only; the server re-checks on every action).
    if (viewerId && !isSelf) {
      body.can = {
        dm: privacyGate.allowed(viewerId, user.id, 'dm'),
        challenge: privacyGate.allowed(viewerId, user.id, 'challenge'),
        friend: body.friendship !== 'none' || privacyGate.allowed(viewerId, user.id, 'friend'),
      };
    }
    if (isSelf) body.privacy = privacyOf(user);
    res.set('Cache-Control', 'no-store');
    res.json(body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
