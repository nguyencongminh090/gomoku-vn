'use strict';

/** #194 — the vite classic-script scanner must not read HTML comments as markup. */

const { classicScriptsIn, findClassicScripts } = require('../../scripts/classic-scripts');
const path = require('path');
const fs = require('fs');

describe('classicScriptsIn', () => {
  it('finds classic scripts, strips ?v=, skips modules', () => {
    const html = '<script src="js/a.js?v=3"></script><script src="js/diag/b.js"></script><script src="js/m.js" type="module"></script>';
    expect(classicScriptsIn(html)).toEqual(['a.js', 'diag/b.js']);
  });

  it('ignores scripts inside comments (the diagnostic.html "<script src="js/..."> tags" prose)', () => {
    const html = '<!-- copied: <script src="js/..."> tags into dist/ --><script src="js/real.js"></script><!-- <script src="js/old.js"></script> -->';
    expect(classicScriptsIn(html)).toEqual(['real.js']);
  });

  it('an unterminated comment hides the rest, like a browser', () => {
    expect(classicScriptsIn('<script src="js/a.js"></script><!-- <script src="js/b.js"></script>')).toEqual(['a.js']);
  });
});

describe('findClassicScripts on the real client/', () => {
  const dir = path.join(__dirname, '..', '..', 'client');
  const files = findClassicScripts(dir);

  it('every file it returns exists under client/js (so the build copy cannot ENOENT)', () => {
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) expect(fs.existsSync(path.join(dir, 'js', f))).toBe(true);
  });
});
