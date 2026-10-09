/**
 * B192 — every page that loads settings-panel.js must also link settings-panel.css,
 * or the .gset-* panel renders as unstyled text at the bottom of the page.
 */
const fs = require('fs');
const path = require('path');

const CLIENT = path.join(__dirname, '..', '..', 'client');
const pages = fs.readdirSync(CLIENT).filter((f) => f.endsWith('.html') && !f.includes('mockup'));

describe('settings-panel.css is linked wherever settings-panel.js loads', () => {
  const users = pages.filter((f) => /js\/settings-panel\.js/.test(fs.readFileSync(path.join(CLIENT, f), 'utf8')));

  it('finds the platform pages among the users', () => {
    expect(users).toEqual(expect.arrayContaining(['rankings.html', 'profile.html', 'clubs.html', 'club.html', 'index.html']));
  });

  it.each(users)('%s links css/settings-panel.css', (f) => {
    const html = fs.readFileSync(path.join(CLIENT, f), 'utf8');
    expect(html).toMatch(/<link[^>]+rel="stylesheet"[^>]+href="css\/settings-panel\.css\?v=\d+"/);
  });
});

describe('platform pages: settings-panel.css loads after platform.css', () => {
  // Same specificity as `.pl :where(button)` → whichever loads last wins; panel sizes must win (B192).
  it.each(['rankings.html', 'profile.html', 'clubs.html', 'club.html'])('%s', (f) => {
    const html = fs.readFileSync(path.join(CLIENT, f), 'utf8');
    expect(html.indexOf('css/settings-panel.css')).toBeGreaterThan(html.indexOf('css/platform.css'));
  });
});
