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

  it.each([['/puzzles/new', 'puzzle-editor.html'], ['/puzzles/mine', 'puzzles-mine.html']])('%s serves %s', (route, file) => {
    expect(index).toContain(`['${route}', '${file}']`);
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'client', file))).toBe(true);
  });

  it.each([['/forum', 'forum.html'], ['/forum/t/:id', 'forum-thread.html']])('%s serves %s', (route, file) => {
    expect(index).toContain(`['${route}', '${file}']`);
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'client', file))).toBe(true);
  });

  it('/admin serves admin.html and the two old queue URLs redirect into its tabs', () => {
    expect(index).toMatch(/app\.get\('\/admin'[\s\S]{0,200}'admin\.html'/);
    expect(index).toContain("app.get('/puzzles/review', (req, res) => res.redirect(301, '/admin#puzzles'))");
    expect(index).toContain("app.get('/forum/reports', (req, res) => res.redirect(301, '/admin#forum'))");
    expect(index).toContain("app.use('/api/admin', adminRouter)");
    expect(fs.existsSync(path.join(__dirname, '..', '..', 'client', 'admin.html'))).toBe(true);
    for (const gone of ['puzzles-review.html', 'forum-reports.html']) expect(fs.existsSync(path.join(__dirname, '..', '..', 'client', gone))).toBe(false);
  });

  it('the forum API is mounted', () => {
    expect(index).toContain("app.use('/api/forum', forumRouter)");
  });

  it('every FORUM_* error code the service throws has a vi + en message', () => {
    const codes = [...new Set(read('server', 'managers', 'ForumService.js').match(/'FORUM_[A-Z_]+'/g))].map((c) => 'err.' + c.slice(1, -1).toLowerCase());
    const i18n = read('client', 'js', 'i18n.js');
    for (const key of codes) expect(i18n.split(`'${key}'`).length - 1).toBeGreaterThanOrEqual(2);
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
