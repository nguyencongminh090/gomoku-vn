'use strict';

/**
 * PrivacyGate — one place that answers "may `fromId` DM / challenge / friend-request `toId`?"
 * from the recipient's stored audience setting (#199): everyone | friends | nobody.
 * 'friends' = accepted friends only. Unknown user or unknown action → allowed=false only for
 * known settings; callers still do their own USER_NOT_FOUND handling.
 */

const database = require('../db/database');

const COLUMN = { dm: 'who_can_dm', challenge: 'who_can_challenge', friend: 'who_can_friend' };

/** @param {'dm'|'challenge'|'friend'} action */
function allowed(fromId, toId, action) {
  const col = COLUMN[action];
  if (!col) throw new Error(`PrivacyGate: unknown action ${action}`);
  const target = database.getProfileById(toId);
  const setting = target ? target[col] : 'everyone';
  if (setting === 'nobody') return false;
  // Lazy: FriendService itself requires this module (circular otherwise).
  if (setting === 'friends') return require('./FriendService').statusBetween(fromId, toId) === 'friends';
  return true;
}

module.exports = { allowed };
