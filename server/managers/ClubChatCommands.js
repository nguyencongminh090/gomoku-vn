'use strict';

/**
 * ClubChatCommands — pure parsing for club chat (B447): staff toggles, slash commands, @mentions.
 * No DB. ClubService.postMessage applies the result (permissions, side effects, notifications).
 */

/** Staff toggles in cài-đặt-nhóm. Anything that fans out to the whole club defaults off. */
const CHAT_DEFAULTS = Object.freeze({
  cmdPin: true,         // /ghim <text>   — staff set the pinned announcement
  cmdChallenge: true,   // /giaohuu @name — friendly (unrated) challenge to a member
  notifyMention: true,  // @username      — that member gets a bell notification
  notifyAll: false,     // @all / @tatca  — staff only, the whole club gets one
  notifyPin: false,     // /ghim also notifies the whole club
  unreadDot: true,      // dot on the trò-chuyện channel for unread messages (club page only)
});
const CHAT_KEYS = Object.keys(CHAT_DEFAULTS);

/** Command word → kind. Words are typed without diacritics (`/giaohữu` is not accepted). */
const COMMANDS = Object.freeze({ ghim: 'pin', giaohuu: 'challenge' });
/** Which toggle gates each command kind. */
const COMMAND_TOGGLE = Object.freeze({ pin: 'cmdPin', challenge: 'cmdChallenge' });

const ALL_WORDS = ['all', 'tatca'];
const MAX_MENTIONS = 5;
const USERNAME = '[A-Za-z0-9_]{3,20}';
const MENTION_RE = new RegExp(`(^|[^A-Za-z0-9_@])@(${USERNAME})(?![A-Za-z0-9_])`, 'g');

/** Stored JSON (or null / corrupt) → full settings object. */
function readSettings(json) {
  let stored = {};
  if (json) {
    try { stored = JSON.parse(json) || {}; } catch (_) { stored = {}; }
  }
  const out = {};
  for (const k of CHAT_KEYS) out[k] = typeof stored[k] === 'boolean' ? stored[k] : CHAT_DEFAULTS[k];
  return out;
}

/**
 * Partial update from the client: known keys only, booleans only. Returns the merged object, or null
 * when the input is invalid (the caller turns that into a 400).
 */
function mergeSettings(current, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out = { ...current };
  for (const [k, v] of Object.entries(input)) {
    if (!CHAT_KEYS.includes(k) || typeof v !== 'boolean') return null;
    out[k] = v;
  }
  return out;
}

/**
 * Raw composer text → null (plain message) or { word, kind, arg }.
 * kind is null for an unknown command. A lone "/" or "/ text" is plain text.
 */
function parseCommand(raw) {
  const m = /^\/([A-Za-z]+)(?:\s+([\s\S]*))?$/.exec(String(raw || '').trim());
  if (!m) return null;
  const word = m[1].toLowerCase();
  return { word, kind: COMMANDS[word] || null, arg: (m[2] || '').trim() };
}

/** "/giaohuu @an 3+2 caro" arg → { username, extras: ['3+2', 'caro'] } or null when no name. */
function parseChallengeArg(arg) {
  const parts = String(arg || '').split(/\s+/).filter(Boolean);
  const name = (parts.shift() || '').replace(/^@/, '');
  if (!new RegExp(`^${USERNAME}$`).test(name)) return null;
  return { username: name, extras: parts };
}

/**
 * @mentions in raw text → { usernames: lower-cased, deduped, capped at MAX_MENTIONS; all: bool }.
 * `@all` / `@tatca` set `all` and are not usernames.
 */
function parseMentions(raw) {
  const seen = new Set();
  let all = false;
  for (const m of String(raw || '').matchAll(MENTION_RE)) {
    const name = m[2].toLowerCase();
    if (ALL_WORDS.includes(name)) { all = true; continue; }
    if (seen.size < MAX_MENTIONS) seen.add(name);
  }
  return { usernames: [...seen], all };
}

module.exports = {
  CHAT_DEFAULTS, CHAT_KEYS, COMMANDS, COMMAND_TOGGLE, MAX_MENTIONS,
  readSettings, mergeSettings, parseCommand, parseChallengeArg, parseMentions,
};
