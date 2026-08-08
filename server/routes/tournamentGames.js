'use strict';

/**
 * tournamentGames.js — REST API routes for tournament games history
 * (TODO.md #78), separate from routes/games.js's casual-game history.
 *
 * GET /api/tournaments/:tournamentId/games — list every individual game
 *   played in a tournament (lightweight, no move data)
 * GET /api/tournament-games/:id — full single game with move data, for
 *   replay — same response shape as GET /api/games/:id so the client's
 *   existing replay viewer (history.js) needs no rendering changes.
 */

const express  = require('express');
const rateLimit = require('express-rate-limit');
const database = require('../db/database');

const router = express.Router();

// Same shape as routes/games.js's gamesLimiter — public/unauthenticated,
// same rationale (spectators/history browsing legitimately means many
// requests).
const tournamentGamesLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
router.use(tournamentGamesLimiter);

// ---------------------------------------------------------------------------
// GET /api/tournaments/:tournamentId/games — list a tournament's games
// ---------------------------------------------------------------------------
router.get('/tournaments/:tournamentId/games', (req, res, next) => {
  try {
    const games = database.getTournamentGames(req.params.tournamentId);
    res.json({ games });
  } catch (err) {
    return next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/tournament-games/:id — single game with full move data
// ---------------------------------------------------------------------------
router.get('/tournament-games/:id', (req, res, next) => {
  try {
    const game = database.getTournamentGameById(req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Không tìm thấy ván đấu.', code: 'GAME_NOT_FOUND' });
    }
    res.json({ game });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
