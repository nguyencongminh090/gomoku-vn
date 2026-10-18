/** Page paper (ui/grid-leaves-home): paper grid + corner leaves behind every platform page and the lobby,
 *  one card-shadow token on outer cards. All colours come from tokens.css so every skin × mode works. */
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const platform = read('css', 'platform.css');
const tokens = read('css', 'tokens.css');

const TOKENS = ['--bg-grid', '--bg-grid-minor', '--bg-leaf-op', '--bg-leaf-filter', '--shadow-card'];

describe('page paper tokens', () => {
  test.each(TOKENS)('%s is defined in all six skin × mode blocks', (name) => {
    const n = (tokens.match(new RegExp('^\\s*' + name + ':', 'gm')) || []).length;
    expect(n).toBe(6);
  });
});

describe('page paper layers (platform.css)', () => {
  test('grid and leaves sit behind page content (z-index -1) on body.pl and body.zen-lobby, never block clicks', () => {
    for (const pseudo of ['::before', '::after']) {
      const m = platform.match(new RegExp('body\\.pl' + pseudo + ',\\s*body\\.zen-lobby' + pseudo + '\\s*\\{([^}]*)\\}'));
      expect(m).not.toBeNull();
      expect(m[1]).toMatch(/position:\s*fixed/);
      expect(m[1]).toMatch(/z-index:\s*-1/);
      expect(m[1]).toMatch(/pointer-events:\s*none/);
    }
  });

  test('body is transparent so html (var(--c-bg)) is the only opaque layer under the -1 pseudo-elements', () => {
    expect(platform).toMatch(/^body\.pl, body\.zen-lobby \{ background: transparent; \}/m);
    expect(read('css', 'main.css')).toMatch(/html, body \{[^}]*background: var\(--c-bg\)/);
  });

  test('grid uses the major + minor tokens, aligned at the same origin (misaligned layers made moiré)', () => {
    const g = platform.match(/body\.pl::before[^{]*\{([^}]*)\}/)[1];
    expect(g).toContain('var(--bg-grid)');
    expect(g).toContain('var(--bg-grid-minor)');
    expect(g).toMatch(/background-size:\s*48px 48px, 48px 48px, 12px 12px, 12px 12px/);
    expect(g).toMatch(/background-position:\s*0 0/);
  });

  test('leaves are a plain background-image (no CSS mask on the SVG itself) and use the opacity/filter tokens', () => {
    const l = platform.match(/body\.pl::after[^{]*\{([^}]*)\}/)[1];
    expect(l).toMatch(/background-image:\s*url\('\.\.\/assets\/patterns\/leaves\.svg\?v=[0-9a-f]{8}'\)/);
    expect(l).toContain('var(--bg-leaf-op)');
    expect(l).toContain('var(--bg-leaf-filter)');
  });

  test('outer cards share --shadow-card', () => {
    for (const sel of ['.ppanel', '.ptbl-wrap', '.phead']) {
      const m = platform.match(new RegExp('^\\' + sel + ' \\{([^}]*)\\}', 'm'));
      expect(m && m[1]).toContain('var(--shadow-card)');
    }
  });
});

describe('leaves asset', () => {
  const file = path.join(__dirname, '..', 'assets', 'patterns', 'leaves.svg');
  test('exists, is the compressed build (<150 KB; the Pixabay original was 718 KB) and has no opaque background rect', () => {
    const svg = fs.readFileSync(file, 'utf8');
    expect(svg.length).toBeLessThan(150 * 1024);
    expect(svg).not.toContain('#f5f2ef');
    expect(svg).toMatch(/viewBox="0 0 1322\.9 1322\.9"/);
  });
});
