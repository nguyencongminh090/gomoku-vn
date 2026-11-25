'use strict';

// Loaded by the club page and required by ClubService. Order is the order in the composer.
(function () {
  const roles = Object.freeze({ owner: 3, officer: 2, member: 1, pending: 0 });
  const rank = (role) => Object.hasOwn(roles, role) ? roles[role] : 0;
  const isMember = (role) => rank(role) >= roles.member;
  const isStaff = (role) => rank(role) >= roles.officer;
  const canModerate = (role, target) => isStaff(role) && rank(role) > rank(target);
  const commands = [
    { kind: 'pin', words: ['ghim', 'pin', 'announce'], toggle: 'cmdPin', staff: true },
    { kind: 'challenge', words: ['giaohuu', 'challenge'], toggle: 'cmdChallenge' },
    { kind: 'poll', words: ['binhchon', 'poll'], toggle: 'cmdPoll' },
    { kind: 'calendar', words: ['lich', 'calendar'], toggle: 'cmdCalendar' },
    { kind: 'mute', words: ['tattieng', 'mute'], staff: true },
    { kind: 'kick', words: ['duoi', 'kick'], staff: true },
    { kind: 'help', words: ['trogiup', 'help'] },
  ];
  const find = (word) => commands.find((command) => command.words.includes(word.toLowerCase()));
  const available = (role, settings) => commands.filter((cmd) => isMember(role)
    && (!cmd.staff || isStaff(role)) && (!cmd.toggle || settings[cmd.toggle]));
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

  const policy = { parseEventArg, roles, rank, isMember, isStaff, canModerate, commands, find, available };
  if (typeof window !== 'undefined') window.ClubPolicy = policy;
  if (typeof module !== 'undefined') module.exports = policy;
})();
