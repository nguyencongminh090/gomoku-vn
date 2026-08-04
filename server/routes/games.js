'use strict';

/**
 * games.js — REST API routes for game history.
 *
 * GET /api/games          — list recent games (paginated, filterable)
 * GET /api/games/stats    — aggregate counts (by date, by result) for the same filters
 * GET /api/games/:id      — get single game with full move data
 */

const express  = require('express');
const rateLimit = require('express-rate-limit');
const database = require('../db/database');

const router = express.Router();

// Both routes are unauthenticated and hit SQLite on every call, so they are
// the cheapest thing on the server to hammer. Same shape as auth.js's
// authLimiter, with a higher ceiling because browsing history legitimately
// means many more requests than logging in does (one per page + one per
// replay opened).
const gamesLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
router.use(gamesLimiter);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse+validate the shared search filters (player/from/to/result) off a
 * request's query string. Anything malformed is silently dropped rather
 * than erroring, so a stray query param never breaks the list view.
 */
function parseGameFilters(query) {
  const filters = {};

  if (typeof query.player === 'string' && query.player.trim()) {
    filters.player = query.player.trim().slice(0, 50);
  }
  if (typeof query.from === 'string' && ISO_DATE_RE.test(query.from)) {
    filters.from = `${query.from}T00:00:00.000Z`;
  }
  if (typeof query.to === 'string' && ISO_DATE_RE.test(query.to)) {
    filters.to = `${query.to}T23:59:59.999Z`;
  }
  if (query.result === 'win' || query.result === 'draw') {
    filters.result = query.result;
  }

  return filters;
}

// ---------------------------------------------------------------------------
// GET /api/games — List recent games
// Note: Intentionally public to allow anyone to view the leaderboard/recent games.
// Supports optional filters: player (name substring), from/to (YYYY-MM-DD,
// inclusive), result ('win' | 'draw').
// ---------------------------------------------------------------------------
router.get('/', (req, res, next) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const filters = parseGameFilters(req.query);

    const games = database.getRecentGames(limit, offset, filters);
    const total = database.getGameCount(filters);

    res.json({
      games,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/games/stats — Aggregate counts for the same filters as GET /
// Mounted before /:id so the literal path "stats" isn't swallowed as an id.
// ---------------------------------------------------------------------------
router.get('/stats', (req, res, next) => {
  try {
    const filters = parseGameFilters(req.query);
    const byDate = database.getGameStatsByDate(filters);
    const byResult = database.getGameStatsByResult(filters);

    res.json({ byDate, byResult });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/games/:id — Get single game with full details
// ---------------------------------------------------------------------------
router.get('/:id', (req, res, next) => {
  try {
    const game = database.getGameById(req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Không tìm thấy ván đấu.', code: 'GAME_NOT_FOUND' });
    }

    // Parse JSON fields
    game.moves   = JSON.parse(game.moves   || '[]');
    game.walls   = JSON.parse(game.walls   || '[]');
    game.portals = JSON.parse(game.portals || '[]');

    res.json({ game });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
