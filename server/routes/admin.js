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
 * GET  /api/admin/rating-integrity      read-only collusion signals (perm rating.integrity: admin only, #249)
 * DELETE /api/admin/users/:id/avatar     remove their avatar (file + DB), logged as an edge
 *
 * Dashboard news (#224; perm news.manage = admin only, checked in NewsService):
 * GET    /api/admin/news           newest 50
 * POST   /api/admin/news           {body, link?}
 * PUT    /api/admin/news/:id       {body, link?}
 * DELETE /api/admin/news/:id
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { verifyToken } = require('../middleware/auth');
const { rejectGuests } = require('../middleware/guest-guard');
const roles = require('../utils/roles');
const svc = require('../managers/AdminUserService');
const cheat = require('../managers/CheatReportService');
const news = require('../managers/NewsService');
const integrity = require('../managers/RatingIntegrityService');

const router = express.Router();
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, keyGenerator: (req) => ipKeyGenerator(getClientIpFromReq(req) || '') }));

const member = [verifyToken, rejectGuests()];
router.get('/me', ...member, (req, res) => {
  const userId = req.user.userId;
  res.json({ role: roles.roleOf(userId), permissions: roles.permissionsOf(userId) });
});

const write = [...member, rateLimit({ windowMs: 60 * 60 * 1000, max: 300, keyGenerator: (req) => ipKeyGenerator(getClientIpFromReq(req) || '') }), express.json({ limit: '8kb' })];

/** Return a service error's status and code, or forward unexpected errors to errorHandler. */
const h = (fn) => (req, res, next) => {
  try {
    fn(req, res, next);
  } catch (err) {
    if (err instanceof svc.AdminUserError || err instanceof cheat.CheatReportError || err instanceof news.NewsError || err instanceof integrity.RatingIntegrityError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
};

router.get('/users', ...member, h((req, res) => {
  res.json(svc.listUsers(req.user.userId, req.query));
}));

router.get('/users/:id', ...member, h((req, res) => {
  res.json(svc.getUser(req.user.userId, req.params.id));
}));

router.post('/users/:id/role', ...write, h((req, res) => {
  res.json({ user: svc.setRole(req.user.userId, req.params.id, (req.body || {}).role) });
}));

router.post('/users/:id/lock', ...write, h((req, res) => {
  const { locked, reason } = req.body || {};
  res.json({ user: svc.setLocked(req.user.userId, req.params.id, locked, reason) });
}));

router.get('/cheat-reports', ...member, h((req, res) => {
  res.json(cheat.openReports(req.user.userId, req.query));
}));

router.post('/cheat-reports/:id/resolve', ...write, h((req, res) => {
  res.json(cheat.resolve(req.user.userId, req.params.id, req.body || {}));
}));

// Computed in a worker thread (B384): the permission check throws synchronously (→ h), the JSON arrives later.
router.get('/rating-integrity', ...member, h((req, res, next) => {
  integrity.reportJson(req.user.userId).then((json) => res.type('application/json').send(json), next);
}));

router.delete('/users/:id/avatar', ...write, h((req, res) => {
  res.json({ user: svc.removeAvatar(req.user.userId, req.params.id) });
}));

router.get('/news', ...member, h((req, res) => {
  res.json(news.list(req.user.userId));
}));

router.post('/news', ...write, h((req, res) => {
  res.status(201).json({ item: news.create(req.user.userId, req.body || {}) });
}));

router.put('/news/:id', ...write, h((req, res) => {
  res.json({ item: news.update(req.user.userId, req.params.id, req.body || {}) });
}));

router.delete('/news/:id', ...write, h((req, res) => {
  res.json(news.remove(req.user.userId, req.params.id));
}));

module.exports = router;
