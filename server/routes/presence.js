'use strict';

/**
 * presence.js — HTTP heartbeat for pages without a socket (#372). Members only.
 *
 * POST /api/presence  {presence: 'active'|'away'} → 204
 * The shell sends it every ~20s while the tab is visible+focused (and once with 'away' when it
 * leaves). State lives in socket/state.js (touchHeartbeat); a missing beat expires after BEAT_TTL_MS.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { verifyToken } = require('../middleware/auth');
const { rejectGuests } = require('../middleware/guest-guard');
const database = require('../db/database');
const state = require('../socket/state');

const router = express.Router();
const keyGenerator = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 60 * 1000, max: 30, keyGenerator }));
router.use(verifyToken, rejectGuests('Khách không có trạng thái.'));

router.post('/', express.json({ limit: '1kb' }), (req, res, next) => {
  try {
    const u = req.user;
    // A beat-only user never passed the socket handshake that loads "hide online" — load it on first beat.
    if (!state.heartbeats.has(u.userId) && !state.sessions.has(u.userId)) {
      const prof = database.getProfileById(u.userId);
      state.setHideOnline(u.userId, !!(prof && prof.hide_online));
    }
    state.touchHeartbeat(u, req.body && req.body.presence === 'away' ? 'away' : 'active');
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
