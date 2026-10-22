/**
 * #317 / docs/todo/B317-lobby-nested-aside-landmark.md
 * The lobby right column must not be an <aside> (axe landmark-complementary-is-top-level);
 * the container-query rule must follow it to the div.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('lobby has no nested complementary landmark (#317)', () => {
  test('index.html has no <aside>', () => {
    expect(read('index.html')).not.toMatch(/<\/?aside\b/);
  });
  test('shell.css container-type targets .hstack, not aside', () => {
    const css = read('css/shell.css');
    expect(css).toMatch(/\.psplit > \.hstack:last-child \{ container-type: inline-size; \}/);
    expect(css).not.toMatch(/zen-lobby \.psplit > aside/);
  });
});
