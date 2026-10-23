'use strict';

/**
 * puzzles.js — REST API for puzzles (#203). Rules live in PuzzleService.
 *
 * GET    /api/puzzles?tag=&level=&rule=&page=   approved list (public)
 * GET    /api/puzzles/meta                      allowed rules / levels / tags
 * GET    /api/puzzles/mine                      my puzzles, all statuses (answers included) + canReview (is admin)
 * GET    /api/puzzles/review?page=              pending queue (admin)
 * POST   /api/puzzles                           submit (→ pending)
 * GET    /api/puzzles/:id                       one puzzle; answers only for author/admin
 * PUT    /api/puzzles/:id                       author edit (→ pending again; solves cleared only if position/answers changed)
 * PATCH  /api/puzzles/:id/title                 {title} rename by author/reviewer; keeps status + solves
 * POST   /api/puzzles/:id/solve                 {moves: [{x,y}|"H8"|"122", ...]} → {correct, attemptsLeft, ...}; 429 PUZZLE_ATTEMPTS_EXCEEDED
 * GET    /api/puzzles/:id/attempts              my own tries (member)
 * GET    /api/puzzles/:id/solvers               who solved it and in how many tries (public)
 * (:id is the UUID or the puzzle's #number)
 * POST   /api/puzzles/:id/review                {decision: approve|reject, level?, note?} (admin)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { optionalUserId } = require('../utils/optional-user');
const { verifyToken } = require('../middleware/auth');
const { rejectGuests } = require('../middleware/guest-guard');
const svc = require('../managers/PuzzleService');

const router = express.Router();
const keyGenerator = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, keyGenerator }));
const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 300, keyGenerator });

const member = [verifyToken, rejectGuests()];
const write = [...member, writeLimiter, express.json({ limit: '128kb' })];

/** Wrap a handler: PuzzleError → its status/code, anything else → errorHandler. */
const h = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (err) {
    if (err instanceof svc.PuzzleError) {
      const body = { error: err.message, code: err.code };
      if (err.attemptsLeft !== undefined) body.attemptsLeft = err.attemptsLeft;
      return res.status(err.status).json(body);
    }
    next(err);
  }
};

router.get('/meta', (req, res) => {
  res.json({ rules: svc.RULES, levels: svc.LEVELS, tags: svc.TAGS, boardSizes: svc.BOARD_SIZES, maxPending: svc.MAX_PENDING_PER_USER });
});

router.get('/', h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.listApproved(optionalUserId(req), req.query));
}));

router.get('/mine', ...member, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ...svc.mine(req.user.userId, req.query), canReview: svc.isAdmin(req.user.userId) });
}));

router.get('/review', ...member, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.reviewQueue(req.user.userId, req.query));
}));

router.post('/', ...write, h((req, res) => {
  res.status(201).json(svc.createPuzzle(req.user.userId, req.body));
}));

router.get('/:id', h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ puzzle: svc.getPuzzle(optionalUserId(req), req.params.id) });
}));

router.put('/:id', ...write, h((req, res) => {
  res.json(svc.updatePuzzle(req.user.userId, req.params.id, req.body));
}));

router.patch('/:id/title', ...write, h((req, res) => {
  res.json(svc.renamePuzzle(req.user.userId, req.params.id, (req.body || {}).title));
}));

router.get('/:id/attempts', ...member, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.myAttempts(req.user.userId, req.params.id));
}));

router.get('/:id/solvers', h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.solvers(req.params.id));
}));

router.post('/:id/solve', ...write, h((req, res) => {
  res.json(svc.solve(req.user.userId, req.params.id, (req.body || {}).moves));
}));

router.post('/:id/review', ...write, h((req, res) => {
  res.json(svc.review(req.user.userId, req.params.id, req.body || {}));
}));

module.exports = router;
