'use strict';

/**
 * notifications.js — REST API for the bell (#198 slice 2). Members only.
 *
 * GET  /api/notifications            {unread, items[≤30]}   (no-store)
 * POST /api/notifications/read       {id?}  → {unread}      (no id = mark all)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { verifyToken } = require('../middleware/auth');
const svc = require('../managers/NotificationService');

const router = express.Router();
const keyGenerator = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, keyGenerator }));

router.use(verifyToken, (req, res, next) => {
  if (!req.user.userId) return res.status(403).json({ error: 'Khách không có thông báo.', code: 'GUEST_FORBIDDEN' });
  next();
});

router.get('/', (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(svc.list(req.user.userId));
  } catch (err) { next(err); }
});

router.post('/read', express.json({ limit: '1kb' }), (req, res, next) => {
  try {
    const id = req.body && Number.isInteger(req.body.id) ? req.body.id : null;
    res.json({ unread: svc.markRead(req.user.userId, id) });
  } catch (err) { next(err); }
});

module.exports = router;
