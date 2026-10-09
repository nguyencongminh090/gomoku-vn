'use strict';

/**
 * dm.js — REST API for persisted direct messages (#198 slice 4). Members only.
 *
 * GET  /api/dm                          conversations [{with, last, unread}] newest first
 * GET  /api/dm/:username?before=<id>    thread page, oldest → newest {with, messages, hasMore}
 * POST /api/dm/:username   {text}       send → the stored message
 * POST /api/dm/:username/read           mark their messages read → {unread}
 * GET  /api/dm/id/:userId  ·  POST /api/dm/id/:userId/read   same, addressed by user id (lobby chat windows)
 * Text is returned in wire form (angle brackets escaped); clients decode at render.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { verifyToken } = require('../middleware/auth');
const svc = require('../managers/DmService');

const router = express.Router();
const keyGenerator = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 900, keyGenerator }));

router.use(verifyToken, (req, res, next) => {
  if (!req.user.userId) return res.status(403).json({ error: 'Khách không dùng được tin nhắn riêng.', code: 'GUEST_FORBIDDEN' });
  next();
});

const h = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (err) {
    if (err instanceof svc.DmError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
};

router.get('/', h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ conversations: svc.conversations(req.user.userId) });
}));

// By user id (lobby chat windows know ids, not usernames). Registered first; "/id/x" has two segments so it never shadows a username.
router.get('/id/:userId', h((req, res) => {
  res.set('Cache-Control', 'no-store');
  const before = parseInt(req.query.before, 10);
  res.json(svc.historyById(req.user.userId, req.params.userId, Number.isInteger(before) ? before : undefined));
}));

router.post('/id/:userId/read', h((req, res) => {
  res.json({ unread: svc.markReadById(req.user.userId, req.params.userId) });
}));

router.get('/:username', h((req, res) => {
  res.set('Cache-Control', 'no-store');
  const before = parseInt(req.query.before, 10);
  res.json(svc.history(req.user.userId, req.params.username, Number.isInteger(before) ? before : undefined));
}));

router.post('/:username', express.json({ limit: '4kb' }), h((req, res) => {
  const text = req.body && typeof req.body.text === 'string' ? req.body.text : '';
  res.status(201).json(svc.send(req.user.userId, req.params.username, text));
}));

router.post('/:username/read', h((req, res) => {
  res.json({ unread: svc.markRead(req.user.userId, req.params.username) });
}));

module.exports = router;
