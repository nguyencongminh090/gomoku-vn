'use strict';

/**
 * shell.js — GET /api/shell: the three calls every member page's nav makes at load,
 * in one round trip (B269). Bodies are exactly those of /api/rankings/me,
 * /api/admin/me and GET /api/notifications. Members only (guests get 403, like
 * notifications); the old endpoints stay for pollers and other callers.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { verifyToken } = require('../middleware/auth');
const roles = require('../utils/roles');
const notifications = require('../managers/NotificationService');
const rankings = require('./rankings');

const router = express.Router();
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, keyGenerator: (req) => ipKeyGenerator(getClientIpFromReq(req) || '') }));

router.get('/', verifyToken, (req, res, next) => {
  try {
    const userId = req.user.userId;
    if (!userId) return res.status(403).json({ error: 'Khách không dùng được tính năng này.', code: 'GUEST_FORBIDDEN' });
    res.set('Cache-Control', 'no-store');
    res.json({
      me: rankings.buildMe(userId),
      admin: { role: roles.roleOf(userId), permissions: roles.permissionsOf(userId) },
      notifications: notifications.list(userId),
    });
  } catch (err) { next(err); }
});

module.exports = router;
