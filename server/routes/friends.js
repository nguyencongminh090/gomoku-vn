'use strict';

/**
 * friends.js — REST API for friendships (#198 slice 1). Rules live in FriendService.
 *
 * GET    /api/friends                    {friends, incoming, outgoing}
 * POST   /api/friends/:username          send a request (or accept a crossed one)
 * POST   /api/friends/:username/accept   accept their request
 * DELETE /api/friends/:username          cancel / decline / unfriend
 * Members only — guests get 403 GUEST_FORBIDDEN.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { verifyToken } = require('../middleware/auth');
const svc = require('../managers/FriendService');

const router = express.Router();
const keyGenerator = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, keyGenerator }));
const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 120, keyGenerator });

const member = [verifyToken, (req, res, next) => {
  if (!req.user.userId) return res.status(403).json({ error: 'Khách không dùng được bạn bè.', code: 'GUEST_FORBIDDEN' });
  next();
}];

const h = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (err) {
    if (err instanceof svc.FriendError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
};

router.get('/', ...member, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.list(req.user.userId));
}));

router.post('/:username', ...member, writeLimiter, h((req, res) => {
  res.status(201).json({ status: svc.request(req.user.userId, req.params.username) });
}));

router.post('/:username/accept', ...member, writeLimiter, h((req, res) => {
  res.json({ status: svc.acceptRequest(req.user.userId, req.params.username) });
}));

router.delete('/:username', ...member, writeLimiter, h((req, res) => {
  res.json({ status: svc.remove(req.user.userId, req.params.username) });
}));

module.exports = router;
