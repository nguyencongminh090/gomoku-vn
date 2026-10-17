'use strict';

/**
 * guest-guard.js — 403 GUEST_FORBIDDEN for guest sessions (#280). A guest carries a `guest_…` userId
 * plus isGuest (there is no users row behind it), so `!req.user.userId` never fires for them and
 * member-only writes ran into FOREIGN KEY failures. Use after verifyToken.
 */

const isGuestUser = (user) => !user || !user.userId || !!user.isGuest || String(user.userId).startsWith('guest_');

/** @param {string} message user-facing reason, e.g. 'Khách không dùng được CLB.' */
function rejectGuests(message = 'Khách không dùng được tính năng này.') {
  return (req, res, next) => {
    if (isGuestUser(req.user)) return res.status(403).json({ error: message, code: 'GUEST_FORBIDDEN' });
    next();
  };
}

module.exports = { rejectGuests, isGuestUser };
