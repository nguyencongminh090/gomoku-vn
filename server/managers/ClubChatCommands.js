'use strict';

/**
 * ClubChatCommands — pure parsing for club chat (B447): staff toggles, slash commands, @mentions, polls (B449).
 * No DB. ClubService.postMessage applies the result (permissions, side effects, notifications).
 */

/** Staff toggles in cài-đặt-nhóm. Anything that fans out to the whole club defaults off. */
const CHAT_DEFAULTS = Object.freeze({
  cmdPin: true,         // /ghim <text>   — staff set the pinned announcement
  cmdChallenge: true,   // /giaohuu @name — friendly (unrated) challenge to a member
  cmdPoll: true,        // /binhchon q | a | b — any member opens a poll (B449)
  cmdCalendar: true,    // /lich — list upcoming events; staff: /lich dd/mm HH:MM Tên (B450)
  notifyMention: true,  // @username      — that member gets a bell notification
  notifyAll: false,     // @all / @tatca  — staff only, the whole club gets one
  notifyPin: false,     // /ghim also notifies the whole club
  notifyPoll: false,    // /binhchon also notifies the whole club
  remindEvents: true,   // 30 min before an event, members who RSVP'd "tham gia" get a reminder (B450; RSVPs only)
  unreadDot: true,      // dot on the trò-chuyện channel for unread messages (club page only)
});
const CHAT_KEYS = Object.keys(CHAT_DEFAULTS);

/** Command word → kind. Words are typed without diacritics (`/giaohữu` is not accepted). */
const COMMANDS = Object.freeze({ ghim: 'pin', giaohuu: 'challenge', binhchon: 'poll', lich: 'calendar' });
/** Which toggle gates each command kind. */
const COMMAND_TOGGLE = Object.freeze({ pin: 'cmdPin', challenge: 'cmdChallenge', poll: 'cmdPoll', calendar: 'cmdCalendar' });

/** /binhchon limits (B449): raw lengths, before DmText.clean escapes anything. */
const POLL = Object.freeze({ MIN_OPTIONS: 2, MAX_OPTIONS: 6, QUESTION_MAX: 140, OPTION_MAX: 50 });

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
 * "/binhchon" arg "Câu hỏi | A | B" → { question, options } or { error } with
 * error ∈ 'usage' | 'too_few' | 'too_many' | 'too_long' | 'duplicate'. Empty parts are dropped.
 */
function parsePollArg(arg) {
  const parts = String(arg || '').split('|').map((x) => x.replace(/\s+/g, ' ').trim());
  const question = parts.shift() || '';
  const options = parts.filter(Boolean);
  if (!question) return { error: 'usage' };
  if (options.length < POLL.MIN_OPTIONS) return { error: 'too_few' };
  if (options.length > POLL.MAX_OPTIONS) return { error: 'too_many' };
  if (question.length > POLL.QUESTION_MAX || options.some((o) => o.length > POLL.OPTION_MAX)) return { error: 'too_long' };
  if (new Set(options.map((o) => o.toLocaleLowerCase('vi'))).size !== options.length) return { error: 'duplicate' };
  return { question, options };
}

/** Club times are Vietnam time (UTC+7, no DST) whatever the server's TZ (B450). */
const VN_OFFSET_MS = 7 * 3600 * 1000;
const EVENT_ARG_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+(\d{1,2})[:hH](\d{2})(?:\s+([\s\S]*))?$/;

/**
 * "/lich" arg "25/12 20:00 Giao hữu" (or "25/12/2027 20h00 …") → { startsAt: ISO, title } or { error } with
 * error ∈ 'usage' | 'date' | 'past'. Without a year: this year in VN time, or next year if that date has passed.
 * Title length is checked by ClubService.createEvent.
 */
function parseEventArg(arg, nowMs = Date.now()) {
  const m = EVENT_ARG_RE.exec(String(arg || '').trim());
  if (!m || !(m[6] || '').trim()) return { error: 'usage' };
  const [d, mo, hh, mi] = [m[1], m[2], m[4], m[5]].map(Number);
  const at = (y) => {
    const ms = Date.UTC(y, mo - 1, d, hh, mi) - VN_OFFSET_MS;
    const v = new Date(ms + VN_OFFSET_MS); // round-trip rejects 31/02, 24:00, 12:60
    return v.getUTCFullYear() === y && v.getUTCMonth() === mo - 1 && v.getUTCDate() === d
      && v.getUTCHours() === hh && v.getUTCMinutes() === mi ? ms : null;
  };
  const thisYear = new Date(nowMs + VN_OFFSET_MS).getUTCFullYear();
  let ms = at(m[3] ? Number(m[3]) : thisYear);
  if (ms === null && !m[3]) ms = at(thisYear + 1); // 29/02 typed in a non-leap year
  if (ms === null) return { error: 'date' };
  if (ms <= nowMs && !m[3]) {
    // Earlier day this year → next year; today with a past hour is a mistake, not next year.
    const today = new Date(nowMs + VN_OFFSET_MS);
    const sameDay = today.getUTCMonth() === mo - 1 && today.getUTCDate() === d;
    const next = sameDay ? null : at(thisYear + 1);
    if (next === null) return { error: 'past' };
    ms = next;
  }
  if (ms <= nowMs) return { error: 'past' };
  return { startsAt: new Date(ms).toISOString(), title: m[6].replace(/\s+/g, ' ').trim() };
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
  CHAT_DEFAULTS, CHAT_KEYS, COMMANDS, COMMAND_TOGGLE, MAX_MENTIONS, POLL,
  readSettings, mergeSettings, parseCommand, parseChallengeArg, parsePollArg, parseEventArg, parseMentions,
};
