'use strict';

const { readSessionIdFromHeader } = require('./session-cookie');
const sessionManager = require('../managers/SessionManager');

/** Session user id (null for guests / logged out) — never rejects; for public pages with owner-only extras. */
function optionalUserId(req) {
  const sid = readSessionIdFromHeader(req.headers.cookie);
  const session = sid ? sessionManager.getValidSession(sid) : null;
  return (session && session.userId) || null;
}

module.exports = { optionalUserId };
