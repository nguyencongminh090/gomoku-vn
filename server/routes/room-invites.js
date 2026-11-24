'use strict';

/**
 * room-invites.js — REST API for "host invites an online player to the room" (F443). Rules in RoomInviteService.
 *
 * GET    /api/room-invites/online   {players: [{userId, username, displayName, avatarUrl}]} — picker, HOST ONLY (403 NOT_HOST):
 *                                   visibly-online members I may invite (not in a room, privacy applied, uncapped)
 * POST   /api/room-invites          {to: username, roomId} → 201 {id, roomId, to, expiresAt}; host of that room only
 * POST   /api/room-invites/:id/accept   invitee → {roomId} (nothing is joined/seated: the client opens the room page)
 * DELETE /api/room-invites/:id      invitee declines / sender cancels (idempotent)
 * Members only.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { verifyToken } = require('../middleware/auth');
const { rejectGuests } = require('../middleware/guest-guard');
const svc = require('../managers/RoomInviteService');

const router = express.Router();
const keyGenerator = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 600, keyGenerator }));
const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 120, keyGenerator });

router.use(verifyToken, rejectGuests('Khách không mời được người chơi.'));

const h = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (err) {
    if (err instanceof svc.RoomInviteError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
};

router.get('/online', h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ players: svc.onlineCandidates(req.user.userId) });
}));

router.post('/', writeLimiter, express.json({ limit: '1kb' }), h((req, res) => {
  const b = req.body || {};
  res.status(201).json(svc.send(req.user.userId, b.to, b.roomId));
}));

router.post('/:id/accept', writeLimiter, h((req, res) => {
  res.json(svc.accept(req.user.userId, req.params.id));
}));

router.delete('/:id', writeLimiter, h((req, res) => {
  svc.close(req.user.userId, req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
