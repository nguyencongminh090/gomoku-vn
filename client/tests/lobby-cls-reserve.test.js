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

  // #qm-actions is no longer reserved: since the hub (Chơi nhanh is #qm-play) it only fills with the
  // cancel button of a search the user started — input-driven, so not CLS (ui-audit home F8).
  it('#qm-actions collapses while empty', () => {
    expect(zen).toMatch(/#qm-actions:empty \{ display: none; \}/);
  });

  it('#home-mine keeps a min-height while empty', () => {
    expect(zen).toMatch(/#home-mine:empty \{ min-height: \d+px; \}/);
  });

  // #358: the sentence + count cards ship their final shape in the HTML, so /api/home only swaps text (no reserve needed).
  it('#358: the sentence ships with its three default blanks; the count cards ship their structure, visible', () => {
    const q = html.match(/<h1 class="hq-q" id="home-q">([\s\S]*?)<\/h1>/);
    expect(q).toBeTruthy();
    expect(q[1].match(/class="hq-blank"/g)).toHaveLength(3);
    expect(html).not.toMatch(/id="home-stats"[^>]*\bhidden\b/);
    for (const id of ['home-n-search', 'home-n-live']) expect(html).toMatch(new RegExp('id="' + id + '">–<'));
  });

  it('hero title reserves a line while empty', () => {
    expect(zen).toMatch(/\.zen-hero__title:empty \{ min-height: 1\.3em;/);
  });

});
