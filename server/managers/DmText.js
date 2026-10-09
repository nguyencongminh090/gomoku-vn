'use strict';

/**
 * DmText — the private-message text pipeline + rate limit, shared by the socket
 * handler (#159) and the REST/persisted path (#198 slice 4). Pure: no DB, no sockets.
 */

const config = require('../config');
const { sanitize } = require('./ChatHandler');
const profanityFilter = require('../../client/js/profanity-filter');

const MAX_MESSAGE_LENGTH = 500;

/** Per-user sliding window: userId → [timestamp, ...] */
const rateLimitMap = new Map();

/** @returns {boolean} true if this message should be BLOCKED */
function isRateLimited(userId) {
  const now = Date.now();
  let timestamps = rateLimitMap.get(userId);
  if (!timestamps) {
    timestamps = [];
    rateLimitMap.set(userId, timestamps);
  }
  const cutoff = now - config.PRIVATE_CHAT_RATE_WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) timestamps.shift();
  if (timestamps.length >= config.PRIVATE_CHAT_RATE_LIMIT) return true;
  timestamps.push(now);
  return false;
}

const forget = (userId) => rateLimitMap.delete(userId);

/** Escape `<` `>`, cap at 500 (… on overflow), mask profanity. '' = nothing to send. */
function clean(raw) {
  const text = sanitize(raw || '');
  if (!text) return '';
  const truncated = text.length > MAX_MESSAGE_LENGTH ? text.slice(0, MAX_MESSAGE_LENGTH) + '…' : text;
  return profanityFilter.filterMessage(truncated);
}

module.exports = { MAX_MESSAGE_LENGTH, isRateLimited, forget, clean };
