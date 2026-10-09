'use strict';

/**
 * PrivateChatHandler.js — 1-on-1 real-time private chat for lobby users (#159).
 *
 * Events:
 *   private_message:send    {toUserId, text}  (client → server)
 *   private_message:receive {messageId, fromUserId, fromUsername, text, timestamp}
 *                                             (server → both participants)
 *   private_message:error   {code}            (server → sender)
 *   user:status             {userId, status}  (server → chat partners on disconnect)
 *   user:disconnected       {userId}          (server → chat partners on disconnect)
 *
 * Ephemeral by design: no DB, no history. Messages are routed straight to the
 * two participant sockets — NEVER broadcast to `lobby` or any shared room.
 *
 * Reuses server/managers/ChatHandler's `sanitize` (angle-bracket escaping) and
 * the shared profanity filter. Rate limiting mirrors that module's sliding
 * window but with its own config constants (PRIVATE_CHAT_RATE_*).
 */

const crypto = require('crypto');
const config = require('../../config');
const logger = require('../../utils/logger');
const { sanitize } = require('../../managers/ChatHandler');
const profanityFilter = require('../../../client/js/profanity-filter');
const { sessions } = require('../state');

const MAX_MESSAGE_LENGTH = 500;

// Per-user sliding window: userId → [timestamp, ...]
const rateLimitMap = new Map();

/**
 * userId → Set<userId> of people this user currently has an open conversation
 * with (a message was exchanged either direction). Used only to notify the
 * other side when someone disconnects.
 */
const activePeers = new Map();

/**
 * @param {string} userId
 * @returns {boolean} true if this message should be BLOCKED
 */
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

function linkPeers(a, b) {
  if (!activePeers.has(a)) activePeers.set(a, new Set());
  if (!activePeers.has(b)) activePeers.set(b, new Set());
  activePeers.get(a).add(b);
  activePeers.get(b).add(a);
}

/**
 * Register private-chat listeners on a socket.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function register(io, socket) {
  const user = socket.user;

  socket.on('private_message:send', (payload = {}) => {
    const fail = (code) => socket.emit('private_message:error', { code });

    if (!user || !user.userId) return fail('MISSING_RECIPIENT');

    const toUserId = payload.toUserId;
    if (!toUserId || typeof toUserId !== 'string') return fail('MISSING_RECIPIENT');
    if (toUserId === user.userId) return fail('CANNOT_CHAT_SELF');

    const recipientSocket = sessions.get(toUserId);

    if (!config.PRIVATE_CHAT_ALLOW_GUESTS &&
        (user.isGuest || (recipientSocket && recipientSocket.user && recipientSocket.user.isGuest))) {
      return fail('GUEST_CHAT_DISABLED');
    }

    const clean = sanitize(payload.text || '');
    if (!clean) return; // silently ignore empty

    const truncated = clean.length > MAX_MESSAGE_LENGTH
      ? clean.slice(0, MAX_MESSAGE_LENGTH) + '…'
      : clean;
    const filtered = profanityFilter.filterMessage(truncated);

    if (isRateLimited(user.userId)) return fail('PRIVATE_CHAT_RATE_LIMITED');

    if (!recipientSocket) return fail('RECIPIENT_OFFLINE');

    const messageId = crypto.randomUUID();
    const base = {
      messageId,
      fromUserId: user.userId,
      fromUsername: user.displayName,
      text: filtered,
      timestamp: Date.now(),
    };

    // `conversationWith` is the *other* participant from each recipient's point
    // of view, so the client can key the message into the right window without
    // guessing. Same messageId both ways (dedup + DOM key only).
    recipientSocket.emit('private_message:receive', { ...base, conversationWith: user.userId });
    socket.emit('private_message:receive', { ...base, conversationWith: toUserId }); // echo to sender

    linkPeers(user.userId, toUserId);
  });
}

/**
 * Notify anyone chatting with `userId` that they went offline, and drop the
 * links. Called from SocketHandler's disconnect branch (after the session
 * registry entry for this socket was removed).
 *
 * @param {import('socket.io').Server} io
 * @param {string} userId
 */
function cleanupUser(io, userId) {
  rateLimitMap.delete(userId);

  // A stale/kicked socket's disconnect fires this too; if the user still has a
  // live session (a newer socket replaced this one), they're not offline —
  // don't tell their chat partners otherwise.
  if (sessions.has(userId)) return;

  const peers = activePeers.get(userId);
  if (peers) {
    for (const peerId of peers) {
      const peerSocket = sessions.get(peerId);
      if (peerSocket) {
        peerSocket.emit('user:status', { userId, status: 'offline' });
        peerSocket.emit('user:disconnected', { userId });
      }
      const back = activePeers.get(peerId);
      if (back) {
        back.delete(userId);
        if (back.size === 0) activePeers.delete(peerId);
      }
    }
    activePeers.delete(userId);
  }
}

module.exports = { register, cleanupUser };
