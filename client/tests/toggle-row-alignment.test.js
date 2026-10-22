/**
 * #285: a wrapping hint in .toggle-name must not squeeze the switch (all switches share one right edge).
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'lobby.css'), 'utf8');
const rule = (sel) => css.match(new RegExp('^' + sel.replace(/\./g, '\\.') + '\\s*\\{([^}]*)\\}', 'm'))[1];

test('toggle label shrinks, switch keeps its width', () => {
  expect(rule('.toggle-name')).toMatch(/flex:\s*1/);
  expect(rule('.toggle-name')).toMatch(/min-width:\s*0/);
  expect(rule('.toggle-switch')).toMatch(/flex:\s*none/);
});
