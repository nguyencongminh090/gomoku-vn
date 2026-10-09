'use strict';

/**
 * rankings.js — REST API for the leaderboards (#176).
 *
 * GET /api/rankings?category=&page=&limit=&q=  — public, paginated, cached ~30 s; q = name search
 *                                                (rows keep their true rank), rows carry delta7 + club
 * GET /api/rankings/me                      — the caller's rank in every category
 *
 * Categories are RatingService.CATEGORIES (the winning rule); ratings are
 * per rule, not per time control.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const database = require('../db/database');
const { verifyToken } = require('../middleware/auth');
const { CATEGORIES, PROVISIONAL_RD } = require('../managers/RatingService');

const router = express.Router();

router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  keyGenerator: (req) => ipKeyGenerator(getClientIpFromReq(req) || ''),
}));

const CACHE_TTL_MS = 30 * 1000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map(); // key -> { at, body }

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return hit.body;
}

function cacheSet(key, body) {
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), body });
}

router.get('/', (req, res, next) => {
  try {
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : CATEGORIES[0];
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 30) : '';
    const key = `${category}:${page}:${limit}:${q}`;

    let body = cacheGet(key);
    if (!body) {
      const offset = (page - 1) * limit;
      const total = q ? database.countSearchRankings(category, q) : database.getRankingCount(category);
      const rows = q
        ? database.searchRankings(category, q, limit, offset)
        : database.getRankings(category, limit, offset).map((r, i) => ({ ...r, rank: offset + i + 1 }));
      const ids = rows.map((r) => r.user_id);
      const deltas = database.getRatingDeltas7(category, ids);
      const clubs = database.getPrimaryClubs(ids);
      const players = rows.map((r) => ({
        rank: r.rank,
        userId: r.user_id,
        username: r.username,
        avatarUrl: r.avatar_v ? `/api/profile/avatar/${r.user_id}.webp?v=${r.avatar_v}` : null,
        displayName: r.display_name,
        rating: Math.round(r.rating),
        games: r.games,
        provisional: r.rd > PROVISIONAL_RD,
        delta7: Math.round(deltas.get(r.user_id) || 0),
        club: clubs.get(r.user_id) || null,
      }));
      body = {
        category,
        q,
        minGames: database.RANKING_MIN_GAMES,
        players,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
      cacheSet(key, body);
    }
    res.json(body);
  } catch (err) {
    return next(err);
  }
});

router.get('/me', verifyToken, (req, res, next) => {
  try {
    const userId = req.user.userId;
    const mine = {};
    if (userId) {
      for (const category of CATEGORIES) {
        const r = database.getUserRanking(userId, category);
        if (r) {
          mine[category] = {
            rank: r.rank,
            rating: Math.round(r.rating),
            games: r.games,
            provisional: r.rd > PROVISIONAL_RD,
            total: database.getRankingCount(category),
          };
        }
      }
    }
    res.set('Cache-Control', 'no-store');
    const me = userId ? database.getUserById(userId) : null;
    res.json({ userId: userId || null, username: me ? me.username : null, minGames: database.RANKING_MIN_GAMES, ratings: mine });
  } catch (err) {
    return next(err);
  }
});

// Test hook — the cache is module-level state.
router._clearCache = () => cache.clear();

module.exports = router;
