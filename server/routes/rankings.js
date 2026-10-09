'use strict';

/**
 * rankings.js — REST API for the leaderboards (#176).
 *
 * GET /api/rankings?category=&page=&limit=  — public, paginated, cached ~30 s
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
    const key = `${category}:${page}:${limit}`;

    let body = cacheGet(key);
    if (!body) {
      const offset = (page - 1) * limit;
      const total = database.getRankingCount(category);
      const players = database.getRankings(category, limit, offset).map((r, i) => ({
        rank: offset + i + 1,
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name,
        rating: Math.round(r.rating),
        games: r.games,
        provisional: r.rd > PROVISIONAL_RD,
      }));
      body = {
        category,
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
    res.json({ userId: userId || null, minGames: database.RANKING_MIN_GAMES, ratings: mine });
  } catch (err) {
    return next(err);
  }
});

// Test hook — the cache is module-level state.
router._clearCache = () => cache.clear();

module.exports = router;
