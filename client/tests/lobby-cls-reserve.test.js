/** @jest-environment jsdom */
// B261: CSS layout can't be measured in jsdom, so pin the reservations that keep the lobby from shifting (real CLS measured in a browser pass).
const fs = require('fs');
const path = require('path');

const css = (f) => fs.readFileSync(path.join(__dirname, '../css', f), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

describe('lobby layout-shift reservations (B261)', () => {
  const shell = css('platform-shell.css');
  const zen = css('shell.css');

  it('#pl-shell reserves exactly the .pnav height', () => {
    const nav = shell.match(/\.pnav \{[^}]*\bheight: (\d+)px/);
    const host = shell.match(/#pl-shell \{ min-height: (\d+)px; \}/);
    expect(nav && host).toBeTruthy();
    expect(host[1]).toBe(nav[1]);
  });

  it.each(['#qm-rule', '#qm-time', '#qm-board', '#qm-actions', '#home-today', '#home-live', '#home-learn', '#home-mine', '#home-forum', '#home-stats'])(
    '%s keeps a min-height while empty',
    (id) => {
      expect(zen).toMatch(new RegExp(id + '[^{]*:empty[^{]*\\{ min-height: \\d+px; \\}'));
    },
  );

  it('hero title reserves a line while empty; #home-stats ships visible (hidden would shift the panels down)', () => {
    expect(zen).toMatch(/\.zen-hero__title:empty \{ min-height: 1\.3em;/);
    expect(html).not.toMatch(/id="home-stats"[^>]*\bhidden\b/);
  });

  it('B271: #home-stats reserves its two wrapped rows at <=480px (375 px CLS 0.124 -> 0.007)', () => {
    const m = zen.match(/@media \(max-width: 480px\) \{[^@]*?#home-stats:empty \{ min-height: (\d+)px; \}/);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBeGreaterThanOrEqual(86);
  });
});
