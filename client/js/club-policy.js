'use strict';

// Loaded by the club page and required by ClubService. Order is the order in the composer.
(function () {
  const roles = Object.freeze({ owner: 3, officer: 2, member: 1, pending: 0 });
  const rank = (role) => Object.hasOwn(roles, role) ? roles[role] : 0;
  const isMember = (role) => rank(role) >= roles.member;
  const isStaff = (role) => rank(role) >= roles.officer;
  const canModerate = (role, target) => isStaff(role) && rank(role) > rank(target);
  // `retired`: still found but no longer offered. 'popup' = typing "/" replaces it (B477). /tattieng and /duoi were
  // removed in B482: they now answer CLUB_COMMAND_UNKNOWN; mute/kick live in the thành-viên channel.
  const commands = [
    { kind: 'poll', words: ['binhchon', 'poll'], toggle: 'cmdPoll' },
    { kind: 'calendar', words: ['lich', 'calendar'], toggle: 'cmdCalendar' },
    { kind: 'challenge', words: ['giaohuu', 'challenge'], toggle: 'cmdChallenge' },
    { kind: 'pin', words: ['ghim', 'pin', 'announce'], toggle: 'cmdPin', staff: true },
    { kind: 'help', words: ['trogiup', 'help'], retired: 'popup' },
  ];
  const find = (word) => commands.find((command) => command.words.includes(word.toLowerCase()));
  const available = (role, settings) => commands.filter((cmd) => isMember(role)
    && !cmd.retired && (!cmd.staff || isStaff(role)) && (!cmd.toggle || settings[cmd.toggle]));
/** Club times are Vietnam time (UTC+7, no DST) whatever the server's or viewer's TZ (B450, B480). */
const VN_OFFSET_MS = 7 * 3600 * 1000;
const EVENT_ARG_RE = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s+(\d{1,2})[:hH](\d{2})(?:\s+([\s\S]*))?$/;

/** An instant (ISO string or ms) → its Vietnam wall clock {y, m: 1-12, d, hh, mi, wd: 0 = Sunday}, or null. */
function vnParts(at) {
  const ms = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  const v = new Date(ms + VN_OFFSET_MS);
  return { y: v.getUTCFullYear(), m: v.getUTCMonth() + 1, d: v.getUTCDate(), hh: v.getUTCHours(), mi: v.getUTCMinutes(), wd: v.getUTCDay() };
}

/**
 * Vietnam wall clock → ISO instant, or null unless the fields name a real minute (rejects 31/02, 24:00, 12:60
 * and two-digit years). Never `new Date(<datetime-local>)`: that reads the viewer's zone.
 */
function vnToIso({ y, m, d, hh = 0, mi = 0 } = {}) {
  if (![y, m, d, hh, mi].every(Number.isInteger) || y < 1000 || y > 9999) return null;
  const ms = Date.UTC(y, m - 1, d, hh, mi) - VN_OFFSET_MS;
  const p = vnParts(ms);
  return p && p.y === y && p.m === m && p.d === d && p.hh === hh && p.mi === mi ? new Date(ms).toISOString() : null;
}

/**
 * "/lich" arg "25/12 20:00 Giao hữu" (or "25/12/2027 20h00 …") → { startsAt: ISO, title } or { error } with
 * error ∈ 'usage' | 'date' | 'past'. Without a year: this year in VN time, or next year if that date has passed.
 * Title length is checked by ClubService.createEvent.
 */
function parseEventArg(arg, nowMs = Date.now()) {
  const m = EVENT_ARG_RE.exec(String(arg || '').trim());
  if (!m || !(m[6] || '').trim()) return { error: 'usage' };
  const [d, mo, hh, mi] = [m[1], m[2], m[4], m[5]].map(Number);
  const at = (y) => { const iso = vnToIso({ y, m: mo, d, hh, mi }); return iso ? Date.parse(iso) : null; };
  const today = vnParts(nowMs);
  let ms = at(m[3] ? Number(m[3]) : today.y);
  if (ms === null && !m[3]) ms = at(today.y + 1); // 29/02 typed in a non-leap year
  if (ms === null) return { error: 'date' };
  if (ms <= nowMs && !m[3]) {
    // Earlier day this year → next year; today with a past hour is a mistake, not next year.
    const sameDay = today.m === mo && today.d === d;
    const next = sameDay ? null : at(today.y + 1);
    if (next === null) return { error: 'past' };
    ms = next;
  }
  if (ms <= nowMs) return { error: 'past' };
  return { startsAt: new Date(ms).toISOString(), title: m[6].replace(/\s+/g, ' ').trim() };
}

  const policy = { parseEventArg, vnParts, vnToIso, roles, rank, isMember, isStaff, canModerate, commands, find, available };
  if (typeof window !== 'undefined') window.ClubPolicy = policy;
  if (typeof module !== 'undefined') module.exports = policy;
})();
