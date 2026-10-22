'use strict';

/**
 * claude-command-skill-collision.test.js — regression for the duplicated `/ui-*` slash-menu rows.
 *
 * `.claude/commands/<name>.md` and `.claude/skills/<name>/` both register `/<name>`. When both
 * exist, the slash menu lists the name several times with stray selection markers. A skill
 * already is a slash command, so a same-named command wrapper is never needed.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const COMMANDS = path.join(ROOT, '.claude', 'commands');
const SKILLS = path.join(ROOT, '.claude', 'skills');

function list(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

describe('.claude commands vs skills', () => {
  test('no command file shares a name with a skill', () => {
    const skills = new Set(list(SKILLS));
    const clashes = list(COMMANDS)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3))
      .filter((name) => skills.has(name));
    expect(clashes).toEqual([]);
  });
});
