'use strict';

/**
 * forum.js — REST API for the forum (#203 7c). Rules live in ForumService. REST only (one-live-socket rule).
 *
 * GET  /api/forum/meta                     categories + limits
 * GET  /api/forum/threads?category=&page=  thread list (public)
 * POST /api/forum/threads                  {category, title, body}              (member)
 * GET  /api/forum/threads/:id?page=        thread + replies (public)
 * POST /api/forum/threads/:id/posts        {body}                               (member)
 * POST /api/forum/report                   {type: thread|post, id, reason}      (member)
 * DELETE /api/forum/threads/:id            soft delete                          (staff)
 * DELETE /api/forum/posts/:id              soft delete                          (staff)
 * GET  /api/forum/reports?page=            open reports                         (staff)
 * POST /api/forum/reports/:id/resolve      {remove?: bool}                      (staff)
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { optionalUserId } = require('../utils/optional-user');
const { verifyToken } = require('../middleware/auth');
const svc = require('../managers/ForumService');

const router = express.Router();
const keyGenerator = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, keyGenerator }));
const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 200, keyGenerator });

const member = [verifyToken, (req, res, next) => {
  if (!req.user.userId) return res.status(403).json({ error: 'Khách không dùng được tính năng này.', code: 'GUEST_FORBIDDEN' });
  next();
}];
const write = [...member, writeLimiter, express.json({ limit: '16kb' })];

/** Wrap a handler: ForumError → its status/code, anything else → errorHandler. */
const h = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (err) {
    if (err instanceof svc.ForumError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
};

router.get('/meta', (req, res) => {
  res.json({ categories: svc.CATEGORIES, titleMax: svc.TITLE_MAX, bodyMax: svc.BODY_MAX, reasonMax: svc.REASON_MAX });
});

router.get('/threads', h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.listThreads(optionalUserId(req), req.query));
}));

router.post('/threads', ...write, h((req, res) => {
  res.status(201).json(svc.createThread(req.user.userId, req.body || {}));
}));

router.get('/threads/:id', h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.getThread(optionalUserId(req), req.params.id, req.query));
}));

router.post('/threads/:id/posts', ...write, h((req, res) => {
  res.status(201).json(svc.reply(req.user.userId, req.params.id, req.body || {}));
}));

router.post('/report', ...write, h((req, res) => {
  res.json(svc.report(req.user.userId, req.body || {}));
}));

router.delete('/threads/:id', ...write, h((req, res) => {
  res.json(svc.remove(req.user.userId, 'thread', req.params.id));
}));

router.delete('/posts/:id', ...write, h((req, res) => {
  res.json(svc.remove(req.user.userId, 'post', req.params.id));
}));

router.get('/reports', ...member, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.openReports(req.user.userId, req.query));
}));

router.post('/reports/:id/resolve', ...write, h((req, res) => {
  res.json(svc.resolveReport(req.user.userId, req.params.id, req.body || {}));
}));

module.exports = router;
