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
/** A tab id is a short random token from the shell; anything else is treated as "no tab id". */
const TAB_RE = /^[A-Za-z0-9_-]{1,32}$/;
// Two layers: a loose per-IP flood guard before auth (many members share one IP behind CGNAT /
// a school or café network), then the real budget per member. A 429 here silently drops the
// user offline, so the per-user cap leaves ample room over the ~3 beats/min + edge reports.
const ipKey = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 60 * 1000, max: 600, keyGenerator: ipKey }));
router.use(verifyToken, rejectGuests('Khách không có trạng thái.'));
router.use(rateLimit({ windowMs: 60 * 1000, max: 60, keyGenerator: (req) => 'u:' + req.user.userId }));

router.post('/', express.json({ limit: '1kb' }), (req, res, next) => {
  try {
    const u = req.user;
    // A beat-only user never passed the socket handshake that loads "hide online" — load it on first beat.
    if (!state.heartbeats.has(u.userId) && !state.sessions.has(u.userId)) {
      const prof = database.getProfileById(u.userId);
      state.setHideOnline(u.userId, !!(prof && prof.hide_online));
    }
    // #487: one beat slot per tab; a cached shell without `tab` shares the '' slot (pre-#487 behaviour).
    const tab = req.body && typeof req.body.tab === 'string' && TAB_RE.test(req.body.tab) ? req.body.tab : '';
    state.touchHeartbeat(u, req.body && req.body.presence === 'away' ? 'away' : 'active', Date.now(), tab);
    res.status(204).end();
  } catch (err) { next(err); }
});

module.exports = router;
