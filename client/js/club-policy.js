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
    { kind: 'help', words: ['trogiup', 'help'] },
  ];
  const find = (word) => commands.find((command) => command.words.includes(word.toLowerCase()));
  const available = (role, settings) => commands.filter((cmd) => isMember(role)
    && (!cmd.staff || isStaff(role)) && (!cmd.toggle || settings[cmd.toggle]));
  const policy = { roles, isMember, isStaff, canModerate, commands, find, available };
  if (typeof window !== 'undefined') window.ClubPolicy = policy;
  if (typeof module !== 'undefined') module.exports = policy;
})();
