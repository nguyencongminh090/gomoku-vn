'use strict';

/**
 * admin.js — /api/admin (R8, #205). The queues themselves stay on /api/puzzles/review and
 * /api/forum/reports (each service gates itself); this only tells the /admin page which tabs
 * the caller may see.
 *
 * GET /api/admin/me   → { role, permissions: ['puzzle.review', ...] }   (members, any role)
 *
 * User management (R8 8b, #206; perm user.manage = admin only, checked in AdminUserService):
 * GET  /api/admin/users?q=&page=        search/list users
 * GET  /api/admin/users/:id             user + 1-hop change graph {user, nodes, edges}
 * POST /api/admin/users/:id/role        {role}
 * POST /api/admin/users/:id/lock        {locked: bool, reason}
 * GET  /api/admin/cheat-reports?page=    open cheat reports (perm cheat.review: moderator+admin, #208)
 * POST /api/admin/cheat-reports/:id/resolve  {confirm: bool}
 * DELETE /api/admin/users/:id/avatar     remove their avatar (file + DB), logged as an edge
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { verifyToken } = require('../middleware/auth');
const roles = require('../utils/roles');
const svc = require('../managers/AdminUserService');
const cheat = require('../managers/CheatReportService');

const router = express.Router();
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, keyGenerator: (req) => ipKeyGenerator(getClientIpFromReq(req) || '') }));

router.get('/me', verifyToken, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const userId = req.user.userId;
  if (!userId) return res.status(403).json({ error: 'Khách không dùng được tính năng này.', code: 'GUEST_FORBIDDEN' });
  res.json({ role: roles.roleOf(userId), permissions: roles.permissionsOf(userId) });
});

const write = [verifyToken, rateLimit({ windowMs: 60 * 60 * 1000, max: 300, keyGenerator: (req) => ipKeyGenerator(getClientIpFromReq(req) || '') }), express.json({ limit: '8kb' })];

/** Wrap a handler: AdminUserError → its status/code, anything else → errorHandler. Guests are not users. */
const h = (fn) => (req, res, next) => {
  try {
    if (!req.user.userId) return res.status(403).json({ error: 'Khách không dùng được tính năng này.', code: 'GUEST_FORBIDDEN' });
    fn(req, res);
  } catch (err) {
    if (err instanceof svc.AdminUserError || err instanceof cheat.CheatReportError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
};

router.get('/users', verifyToken, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.listUsers(req.user.userId, req.query));
}));

router.get('/users/:id', verifyToken, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.getUser(req.user.userId, req.params.id));
}));

router.post('/users/:id/role', ...write, h((req, res) => {
  res.json({ user: svc.setRole(req.user.userId, req.params.id, (req.body || {}).role) });
}));

router.post('/users/:id/lock', ...write, h((req, res) => {
  const { locked, reason } = req.body || {};
  res.json({ user: svc.setLocked(req.user.userId, req.params.id, locked === true, reason) });
}));

router.get('/cheat-reports', verifyToken, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(cheat.openReports(req.user.userId, req.query));
}));

router.post('/cheat-reports/:id/resolve', ...write, h((req, res) => {
  res.json(cheat.resolve(req.user.userId, req.params.id, req.body || {}));
}));

router.delete('/users/:id/avatar', ...write, h((req, res) => {
  res.json({ user: svc.removeAvatar(req.user.userId, req.params.id) });
}));

module.exports = router;
