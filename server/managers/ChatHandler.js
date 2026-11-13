'use strict';

/**
 * ChatHandler.js — Per-room chat with rate limiting and sanitization.
 *
 * Rate limit: max CHAT_RATE_LIMIT messages per CHAT_RATE_WINDOW_MS per user.
 * Sanitization: escape angle brackets in messages (see `sanitize`).
 * Profanity: VI/EN bad words are masked (see ../../client/js/profanity-filter.js).
 * This is the authoritative pass — the client also filters optimistically,
 * but only this server-side pass determines what other participants see.
 * Masking is silent by design: no toast, log line, or indicator to anyone.
 *
 * Manual test checklist:
 *   [ ] Message broadcast reaches all room members
 *   [ ] Rate limit blocks 6th message within 3s window
 *   [ ] HTML tags are escaped in messages, closed and unclosed alike
 *   [ ] Empty messages are rejected
 *   [ ] Messages longer than 500 chars are truncated
 *   [ ] An exact bad word (e.g. "shit", "lồn") is masked to asterisks
 *   [ ] An obfuscated/misspelled variant (e.g. "sh1t", "d.m") is masked
 *   [ ] A diacritic-stripped Vietnamese variant (e.g. "dit me may") is masked
 *   [ ] A false-positive-prone legitimate word (e.g. "buổi sáng", "các bạn") passes through unmasked
 *   [ ] A clean message passes through completely unchanged
 */

const config = require('../config');
const logger = require('../utils/logger');
const profanityFilter = require('../../client/js/profanity-filter');

// Per-user sliding window: userId → [timestamp, timestamp, ...]
const rateLimitMap = new Map();

const MAX_MESSAGE_LENGTH = 500;

/**
 * Check if a user is rate-limited.
 * Uses a sliding window: keep only timestamps within the last CHAT_RATE_WINDOW_MS.
 *
 * @param {string} userId
 * @returns {boolean} true if the message should be BLOCKED
 */
function isRateLimited(userId) {
  const now = Date.now();
  let timestamps = rateLimitMap.get(userId);

  if (!timestamps) {
    timestamps = [];
    rateLimitMap.set(userId, timestamps);
  }

  // Remove timestamps outside the window
  const cutoff = now - config.CHAT_RATE_WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  // Check limit
  if (timestamps.length >= config.CHAT_RATE_LIMIT) {
    return true; // Blocked
  }

  // Record this message
  timestamps.push(now);
  return false;
}

/**
 * Neutralize HTML markup in a string by escaping the angle brackets.
 *
 * This replaced an earlier `replace(/<[^>]*>/g, '')` tag-strip, which only
 * removed *closed* tags: an unterminated `<img src=x onerror=alert(1)` passed
 * through untouched, so anything that ever rendered a message as HTML would
 * parse it as a live tag. Escaping is not a stricter strip rule, it is a
 * different strategy — the text is never markup to begin with.
 *
 * `&` is deliberately NOT escaped. Messages are rendered with `textContent`
 * (client/js/chat-ui.js), so escaping `&` would visibly mangle ordinary text
 * like "R&D" into "R&amp;D", and omitting it costs nothing security-wise: an
 * HTML parser decodes `&lt;` into a literal "<" text node and does not re-parse
 * that result as a tag.
 *
 * @param {string} str
 * @returns {string}
 */
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
}

/**
 * Process and broadcast a chat message to a room.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @param {string} roomId
 * @param {string} text — raw message text from client
 */
function handleMessage(io, socket, roomId, text) {
  const user = socket.user;

  // Validate
  const clean = sanitize(text);
  if (!clean || clean.length === 0) {
    return; // Silently ignore empty messages
  }

  // Truncate
  const truncated = clean.length > MAX_MESSAGE_LENGTH
    ? clean.slice(0, MAX_MESSAGE_LENGTH) + '…'
    : clean;

  // Mask profanity (authoritative — this is what gets broadcast)
  const filtered = profanityFilter.filterMessage(truncated);

  // Rate limit
  if (isRateLimited(user.userId)) {
    socket.emit('chat:error', {
      message: 'Bạn đang gửi tin nhắn quá nhanh. Vui lòng chờ một chút.',
      code: 'CHAT_RATE_LIMITED',
    });
    return;
  }

  const payload = {
    from: user.displayName,
    fromId: user.userId,
    text: filtered,
    timestamp: Date.now(),
  };

  // Broadcast to all room members (including sender)
  io.to(roomId).emit('chat:message', payload);
}

// ── Reactions (#368) ──────────────────────────────────────────────────────
// Phone "live stage": a tap on 👏 floats an emoji for everyone in the room. Only a kind id travels (never free
// text), so there is nothing to sanitize or filter. Own sliding window, so clapping never eats the chat budget.
const REACTION_KINDS = ['clap', 'heart', 'fire', 'wow'];
const REACT_RATE_LIMIT = 8;
const REACT_RATE_WINDOW_MS = 3000;
const reactRateMap = new Map();

function isReactRateLimited(userId) {
  const now = Date.now();
  const stamps = (reactRateMap.get(userId) || []).filter((t) => t > now - REACT_RATE_WINDOW_MS);
  if (stamps.length >= REACT_RATE_LIMIT) { reactRateMap.set(userId, stamps); return true; }
  stamps.push(now);
  reactRateMap.set(userId, stamps);
  return false;
}

/**
 * Broadcast a reaction to the rest of the room (the sender already played it locally).
 * Unknown kinds and rate-limited taps are dropped silently — a lost clap needs no error.
 *
 * @param {import('socket.io').Socket} socket
 * @param {string} roomId
 * @param {string} kind — one of REACTION_KINDS
 * @returns {boolean} true when broadcast
 */
function handleReaction(socket, roomId, kind) {
  if (typeof kind !== 'string' || !REACTION_KINDS.includes(kind)) return false;
  const userId = socket.user.userId;
  if (isReactRateLimited(userId)) return false;
  socket.to(roomId).emit('room:react', { kind, fromId: userId });
  return true;
}

/**
 * Clean up rate limit data for a user (on disconnect).
 * @param {string} userId
 */
function cleanupUser(userId) {
  rateLimitMap.delete(userId);
  reactRateMap.delete(userId);
}

module.exports = { handleMessage, handleReaction, cleanupUser, sanitize, REACTION_KINDS, REACT_RATE_LIMIT };
