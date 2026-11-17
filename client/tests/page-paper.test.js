/** #409: the page background is a solid colour (grid + corner leaves removed). Colours come from tokens.css so every
 *  skin x mode works; outer cards keep the shared --shadow-card for separation from the flat background. */
const fs = require('fs');
const path = require('path');
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const platform = read('css', 'platform.css');
const tokens = read('css', 'tokens.css');
const shell = read('css', 'shell.css');

describe('solid page background (#409)', () => {
  test('--shadow-card is still defined in all six skin x mode blocks', () => {
    expect((tokens.match(/^\s*--shadow-card:/gm) || []).length).toBe(6);
  });

  test.each(['--bg-grid', '--bg-grid-minor', '--bg-leaf-op', '--bg-leaf-filter'])('%s token is gone', (name) => {
    expect(tokens).not.toContain(name);
  });

  test('no grid/leaf pseudo-element layers on body.pl / body.zen-lobby (platform.css, shell.css)', () => {
    for (const css of [platform, shell]) {
      expect(css).not.toMatch(/body\.pl::(before|after)/);
      expect(css).not.toMatch(/body\.zen-lobby(:has\([^)]*\))?::(before|after)/);
      expect(css).not.toContain('assets/patterns/leaves');
    }
  });

  test('body.pl paints var(--c-bg) itself and is not forced transparent', () => {
    expect(platform).toMatch(/^body\.pl \{[^}]*background: var\(--c-bg\)/m);
    expect(platform).not.toMatch(/body\.pl, body\.zen-lobby \{ background: transparent/);
    expect(read('css', 'main.css')).toMatch(/html, body \{[^}]*background: var\(--c-bg\)/);
  });

  test('default skin uses the chosen solid colours (light #fafaf8, dark #121212)', () => {
    const dark = tokens.match(/^:root \{([\s\S]*?)\n\}/m)[1];
    const light = tokens.match(/^:root\[data-mode="light"\] \{([\s\S]*?)\n\}/m)[1];
    expect(dark).toMatch(/--c-bg:\s*#121212/);
    expect(light).toMatch(/--c-bg:\s*#fafaf8/);
  });

  test('outer cards share --shadow-card', () => {
    for (const sel of ['.ppanel', '.ptbl-wrap', '.phead']) {
      const m = platform.match(new RegExp('^\\' + sel + ' \\{([^}]*)\\}', 'm'));
      expect(m && m[1]).toContain('var(--shadow-card)');
    }
  });
});
