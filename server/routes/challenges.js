'use strict';

/**
 * challenges.js — REST API for friend challenges (#198 slice 3). Rules in ChallengeService.
 *
 * GET    /api/challenges               {incoming, outgoing}
 * POST   /api/challenges               {to: username, rule, time, rated}  → challenge
 * POST   /api/challenges/:id/accept    recipient → {roomId}
 * DELETE /api/challenges/:id           recipient declines / sender cancels (idempotent)
 * Members only. Rule / time values are the quick-match chips (B197).
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { verifyToken } = require('../middleware/auth');
const svc = require('../managers/ChallengeService');

const router = express.Router();
const keyGenerator = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, keyGenerator }));
const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 120, keyGenerator });

router.use(verifyToken, (req, res, next) => {
  if (!req.user.userId) return res.status(403).json({ error: 'Khách không thách đấu được.', code: 'GUEST_FORBIDDEN' });
  next();
});

const h = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (err) {
    if (err instanceof svc.ChallengeError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
};

router.get('/', h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.list(req.user.userId));
}));

router.post('/', writeLimiter, express.json({ limit: '1kb' }), h((req, res) => {
  const b = req.body || {};
  res.status(201).json(svc.send(req.user.userId, b.to, b));
}));

router.post('/:id/accept', writeLimiter, h((req, res) => {
  res.json(svc.accept(req.user.userId, req.params.id, getClientIpFromReq(req)));
}));

router.delete('/:id', writeLimiter, h((req, res) => {
  svc.close(req.user.userId, req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
