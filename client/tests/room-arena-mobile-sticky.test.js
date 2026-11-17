/**
 * #216 — mobile room keeps nav + cards + board stuck while the panel scrolls.
 * position:sticky dies if body is a scroll container (main.css body{overflow-x:hidden}, same trap as #215),
 * and the stack must not be taller than a short phone leaves room for. CSS layout itself was verified in a real
 * browser (390x844, 375x667, 320x568); this guards the two lines that silently break it.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'room-arena.css'), 'utf8');

test('the document never scrolls on phones — .room is the scroller (browser bars never auto-hide, viewport stays put)', () => {
  const phone = css.slice(css.indexOf('@media (max-width: 768px) {'));
  expect(phone).toMatch(/html:has\(body\.arena-room\), body\.arena-room \{ overflow: hidden; \}/);
  expect(phone).toMatch(/body\.arena-room \.room \{[^}]*height: calc\(100dvh - var\(--nav-h\)\);[^}]*overflow-y: auto/);
  expect(phone).not.toMatch(/body\.arena-room \.room \{[^}]*min-height: calc\(100dvh/);
  // cards/board/tiles must not be squeezed by the fixed-height column; sticky tops are relative to .room
  expect(phone).toMatch(/body\.arena-room \.room > \*, body\.arena-room \.rail > \* \{ flex-shrink: 0; \}/);
  expect(phone).toMatch(/\.seatcard--top \{ top: 0;/);
});
test('--board-h is not redeclared on body (it would shadow the :root value room-ui.js sets)', () => {
  expect(css).not.toMatch(/body\.arena-room \{[^}]*--board-h\s*:/);
});
test('board is capped only on short viewports, with svh (stable while the toolbar collapses)', () => {
  expect(css).toMatch(/max-height: 600px\) \{\s*body\.arena-room \.board-area-shell \.board-area \{\s*width: min\(100%, max\(260px, calc\(100svh/);
  expect(css).not.toMatch(/\.board-area \{\s*width: min\(100%, max\(260px, calc\(100dvh/);
});
test('every phone caps the board so nav + seat row + board + tiles + minimized bar fit the small viewport (iPhone 13 overflowed 16px)', () => {
  expect(css).toMatch(/@media \(max-width: 768px\) \{\s*body\.arena-room \{ --tiles-h: 62px; --minbar-h: 57px; \}\s*body\.arena-room \.board-area-shell \.board-area \{\s*width: min\(100%, max\(260px, calc\(100svh - var\(--nav-h\) - var\(--seatcard-h\) - var\(--tiles-h\) - var\(--minbar-h\)\)\)\);/);
  // the short-screen rule (more board room for the panel) still comes after it, so it wins below 600px
  expect(css.indexOf('max-height: 600px')).toBeGreaterThan(css.indexOf('var(--minbar-h))))'));
});
test('#412: phone chat input is >= 16px — iOS Safari zooms the page on focus below 16px and never zooms back (board pinch #400 eats pinch-out)', () => {
  const phone = css.slice(css.indexOf('@media (max-width: 768px) {'));
  expect(phone).toMatch(/body\.arena-room \.chat-input input \{[^}]*font-size: 16px/);
});

describe('#413 phone seat row: both clocks above the board (the bottom-right clock sat under the thumb)', () => {
  const phone = css.slice(css.indexOf('@media (max-width: 768px) {'));
  test('both cards are half-width, sticky at the top; the bottom card is pulled up into the right half', () => {
    expect(phone).toMatch(/\.seatcard--top \{ order: 1; \}/);
    expect(phone).toMatch(/\.seatcard--bottom \{ order: 1; \}/);
    expect(phone).toMatch(/body\.arena-room \.seatcard \{[^}]*width: 50%;/);
    expect(phone).toMatch(/\.seatcard--bottom \{ margin: calc\(-1 \* var\(--seatcard-h\)\) 0 0 50%;/);
    expect(phone).toMatch(/\.seatcard--bottom \{ top: 0; z-index: 30;/);
    expect(phone).not.toMatch(/top: calc\(var\(--seatcard-h\) \+ var\(--board-h/);
  });
  test('board caps count one seat row, not two', () => {
    expect(css).not.toMatch(/2 \* var\(--seatcard-h\)/);
  });
  test('long names: one line + ellipsis, name font scales down on small screens, clock too', () => {
    expect(css).toMatch(/\.seatcard__name \{[^}]*white-space: nowrap; overflow: hidden; text-overflow: ellipsis;/);
    expect(phone).toMatch(/\.seatcard__id \{ grid-area: id; min-width: 0; \}/);
    expect(phone).toMatch(/\.seatcard__name \{ font-size: clamp\(12px, 3\.6vw, 15px\);/);
    expect(phone).toMatch(/font-size: clamp\(20px, 6\.4vw, 26px\)/);
  });
  test('my card is mirrored (avatar right) and the running cell is filled, not just its clock', () => {
    expect(phone).toMatch(/grid-template-areas: "st id av" "st clk av"; text-align: right;/);
    expect(phone).toMatch(/\.seatcard--turn::before \{ background: var\(--c-brand\);/);
  });
});
