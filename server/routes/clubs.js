'use strict';

/**
 * clubs.js — REST API for clubs (#178). Rules live in ClubService.
 *
 * GET    /api/clubs?q=&page=            discover list (public)
 * POST   /api/clubs                     create
 * GET    /api/clubs/mine                my clubs
 * GET    /api/clubs/:slug?category=     club page + member leaderboard (public)
 * PUT    /api/clubs/:slug               edit description / join policy
 * DELETE /api/clubs/:slug               delete (owner)
 * POST   /api/clubs/:slug/join | /leave
 * POST   /api/clubs/:slug/members/:username/approve
 * DELETE /api/clubs/:slug/members/:username        reject request / kick
 * PUT    /api/clubs/:slug/members/:username/role   {role: officer|member|owner}
 * POST   /api/clubs/:slug/events                   {title, startsAt} staff
 * DELETE /api/clubs/:slug/events/:id                staff
 * GET    /api/clubs/:slug/messages?before=|after=   members only (polling)
 * POST   /api/clubs/:slug/messages                  {text} members only
 * DELETE /api/clubs/:slug/messages/:id              staff
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { optionalUserId } = require('../utils/optional-user');
const { verifyToken } = require('../middleware/auth');
const { CATEGORIES } = require('../managers/RatingService');
const svc = require('../managers/ClubService');

const router = express.Router();
const keyGenerator = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, keyGenerator }));
const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 120, keyGenerator });

const write = [verifyToken, (req, res, next) => {
  if (!req.user.userId) return res.status(403).json({ error: 'Khách không dùng được CLB.', code: 'GUEST_FORBIDDEN' });
  next();
}, writeLimiter, express.json({ limit: '4kb' })];

/** Wrap a handler: ClubError → its status/code, anything else → errorHandler. */
const h = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (err) {
    if (err instanceof svc.ClubError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
};

const category = (req) => (CATEGORIES.includes(req.query.category) ? req.query.category : CATEGORIES[0]);

router.get('/', h((req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 30) : '';
  const { total, clubs } = svc.listClubs({ q, page, limit, category: category(req) });
  res.json({ clubs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

router.post('/', ...write, h((req, res) => {
  res.status(201).json(svc.createClub(req.user.userId, req.body || {}));
}));

router.get('/mine', verifyToken, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ clubs: req.user.userId ? svc.clubsOfUser(req.user.userId) : [] });
}));

router.get('/:slug', h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.getClubDetail(req.params.slug, optionalUserId(req), req.query.category));
}));

router.put('/:slug', ...write, h((req, res) => {
  svc.updateClub(req.user.userId, req.params.slug, req.body || {});
  res.json({ ok: true });
}));

router.delete('/:slug', ...write, h((req, res) => {
  svc.deleteClub(req.user.userId, req.params.slug);
  res.json({ ok: true });
}));

router.post('/:slug/join', ...write, h((req, res) => {
  res.json({ role: svc.join(req.user.userId, req.params.slug) });
}));

router.post('/:slug/leave', ...write, h((req, res) => {
  svc.leave(req.user.userId, req.params.slug);
  res.json({ ok: true });
}));

function target(req) {
  const id = svc.userIdByUsername(req.params.username);
  if (!id) throw new svc.ClubError('CLUB_NOT_MEMBER', 404, 'Không tìm thấy người chơi.');
  return id;
}

router.post('/:slug/members/:username/approve', ...write, h((req, res) => {
  svc.approve(req.user.userId, req.params.slug, target(req));
  res.json({ ok: true });
}));

router.delete('/:slug/members/:username', ...write, h((req, res) => {
  svc.remove(req.user.userId, req.params.slug, target(req));
  res.json({ ok: true });
}));

router.put('/:slug/members/:username/role', ...write, h((req, res) => {
  svc.setRole(req.user.userId, req.params.slug, target(req), (req.body || {}).role);
  res.json({ ok: true });
}));

router.post('/:slug/events', ...write, h((req, res) => {
  res.status(201).json(svc.createEvent(req.user.userId, req.params.slug, req.body || {}));
}));

router.delete('/:slug/events/:id', ...write, h((req, res) => {
  svc.deleteEvent(req.user.userId, req.params.slug, req.params.id);
  res.json({ ok: true });
}));

const readAuth = [verifyToken, (req, res, next) => {
  if (!req.user.userId) return res.status(403).json({ error: 'Khách không dùng được CLB.', code: 'GUEST_FORBIDDEN' });
  next();
}];

router.get('/:slug/messages', ...readAuth, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ messages: svc.listMessages(req.user.userId, req.params.slug, req.query) });
}));

router.post('/:slug/messages', ...write, h((req, res) => {
  res.status(201).json(svc.postMessage(req.user.userId, req.params.slug, (req.body || {}).text));
}));

router.delete('/:slug/messages/:id', ...write, h((req, res) => {
  svc.deleteMessage(req.user.userId, req.params.slug, req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
