'use strict';

/** #203 7a-2 — the puzzle pages are wired: server routes → existing HTML, "Học" nav → /puzzles. */
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', '..', ...p), 'utf8');

describe('puzzle pages wiring', () => {
  const index = read('server', 'index.js');

  it.each([
    ["app.get('/puzzles'", 'puzzles.html'],
    ["app.get('/puzzle/:id'", 'puzzle.html'],
  ])('%s serves %s', (route, file) => {
    const at = index.indexOf(route);
    expect(at).toBeGreaterThan(-1);
    expect(index.slice(at, at + 200)).toContain(`'${file}'`);
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'client', file))).toBe(true);
  });

  it.each([['/puzzles/new', 'puzzle-editor.html'], ['/puzzles/mine', 'puzzles-mine.html'], ['/puzzles/review', 'puzzles-review.html']])('%s serves %s', (route, file) => {
    expect(index).toContain(`['${route}', '${file}']`);
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'client', file))).toBe(true);
  });

  it('the Học nav item lands on /puzzles, not the profile', () => {
    expect(read('client', 'js', 'platform-shell.js')).toMatch(/id: 'learn', href: '\/puzzles'/);
  });

  it('every PUZZLE_* error code the service throws has a vi + en message', () => {
    const codes = [...new Set(read('server', 'managers', 'PuzzleService.js').match(/'PUZZLE_[A-Z_]+'/g))]
      .map((c) => 'err.' + c.slice(1, -1).toLowerCase());
    const i18n = read('client', 'js', 'i18n.js');
    for (const key of codes) {
      expect(i18n.split(`'${key}'`).length - 1).toBeGreaterThanOrEqual(2);
    }
  });
});
