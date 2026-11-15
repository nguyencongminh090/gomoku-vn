'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db/database');

/** Verify an old credential and resolve member identities from the current account record. */
function legacyIdentity(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return null;
  }
  if (!payload || typeof payload.userId !== 'string' || !payload.userId || !Number.isFinite(payload.exp)) return null;
  const expiresAt = payload.exp * 1000;
  if (payload.isGuest === true) {
    if (typeof payload.displayName !== 'string' || !payload.displayName) return null;
    return { userId: payload.userId, displayName: payload.displayName, isGuest: true, expiresAt };
  }
  const user = db.getUserById(payload.userId);
  if (!user || user.locked_at) return null;
  return { userId: user.id, displayName: user.display_name, isGuest: false, expiresAt };
}

module.exports = { legacyIdentity };
