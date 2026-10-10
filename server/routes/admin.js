'use strict';

/**
 * admin.js — /api/admin (R8, #205). The queues themselves stay on /api/puzzles/review and
 * /api/forum/reports (each service gates itself); this only tells the /admin page which tabs
 * the caller may see.
 *
 * GET /api/admin/me   → { role, permissions: ['puzzle.review', ...] }   (members, any role)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { verifyToken } = require('../middleware/auth');
const roles = require('../utils/roles');

const router = express.Router();
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, keyGenerator: (req) => ipKeyGenerator(getClientIpFromReq(req) || '') }));

router.get('/me', verifyToken, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const userId = req.user.userId;
  if (!userId) return res.status(403).json({ error: 'Khách không dùng được tính năng này.', code: 'GUEST_FORBIDDEN' });
  res.json({ role: roles.roleOf(userId), permissions: roles.permissionsOf(userId) });
});

module.exports = router;
