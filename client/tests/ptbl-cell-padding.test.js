/** Platform tables (.ptbl): cells keep real horizontal padding so the hover / is-me row
 *  highlight never sits flush against the text (ticket-rows rule 2: never padding 0). */
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'platform.css'), 'utf8');

function decl(selector) {
  const m = css.match(new RegExp('^' + selector.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}', 'm'));
  return m ? m[1] : '';
}

describe('.ptbl cell padding', () => {
  test.each(['.ptbl th', '.ptbl td'])('%s has no zero side padding', (sel) => {
    const pad = /padding:\s*([^;]+);/.exec(decl(sel));
    expect(pad).not.toBeNull();
    const parts = pad[1].trim().split(/\s+/);
    const [t, r = t, , l = r] = parts;
    expect(parseInt(r, 10)).toBeGreaterThan(0);
    expect(parseInt(l, 10)).toBeGreaterThan(0);
  });
});
