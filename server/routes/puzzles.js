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
 * PUT    /api/puzzles/:id                       author edit (→ pending again)
 * POST   /api/puzzles/:id/solve                 {moves: [{x,y}|"H8"|"122", ...]} → {correct}
 * POST   /api/puzzles/:id/review                {decision: approve|reject, level?, note?} (admin)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { optionalUserId } = require('../utils/optional-user');
const { verifyToken } = require('../middleware/auth');
const svc = require('../managers/PuzzleService');

const router = express.Router();
const keyGenerator = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, keyGenerator }));
const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 300, keyGenerator });

const member = [verifyToken, (req, res, next) => {
  if (!req.user.userId) return res.status(403).json({ error: 'Khách không dùng được tính năng này.', code: 'GUEST_FORBIDDEN' });
  next();
}];
const write = [...member, writeLimiter, express.json({ limit: '128kb' })];

/** Wrap a handler: PuzzleError → its status/code, anything else → errorHandler. */
const h = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (err) {
    if (err instanceof svc.PuzzleError) return res.status(err.status).json({ error: err.message, code: err.code });
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
  res.json({ puzzles: svc.mine(req.user.userId), canReview: svc.isAdmin(req.user.userId) });
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

router.post('/:id/solve', ...write, h((req, res) => {
  res.json(svc.solve(req.user.userId, req.params.id, (req.body || {}).moves));
}));

router.post('/:id/review', ...write, h((req, res) => {
  res.json(svc.review(req.user.userId, req.params.id, req.body || {}));
}));

module.exports = router;
