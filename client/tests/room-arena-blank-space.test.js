/**
 * #218 — mobile room: no empty band under the chat input, no page overscroll gap.
 * Layout itself was measured in a real browser (390x844, 360x740, 375x667, 320x568); jsdom has no layout,
 * so this guards the CSS lines that cause it: game.css's zen-era phone cap on .chat-messages and a missing
 * overscroll-behavior on the root scroller.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'css', f), 'utf8');
const arena = read('room-arena.css');
const phone = arena.slice(arena.indexOf('@media (max-width: 768px) {'));

test('game.css still caps phone chat at 180px (shared with tournament-match) — so the room must undo it', () => {
  expect(read('game.css')).toMatch(/\.chat-messages \{\s*max-height: 180px;/);
});
test('arena room phone block lifts the chat cap so messages fill the panel down to the input', () => {
  expect(phone).toMatch(/body\.arena-room \.chat-messages \{[^}]*max-height: none/);
});
test('few chat messages are bottom-aligned next to the input without breaking scroll-back', () => {
  expect(phone).toMatch(/body\.arena-room \.chat-messages > :first-child \{ margin-top: auto; \}/);
});
test('page overscroll is off on html (the viewport reads it from the root element) and body', () => {
  expect(arena).toMatch(/html:has\(body\.arena-room\), body\.arena-room \{ overscroll-behavior: none; \}/);
});

// user 2026-10-11: in the expanded panel, a swipe that starts on a chat list already at its start must move the
// panel (.room) back down, and the ▲/▼ toggle stays visible while .room is scrolled.
test('chat/moves lists chain their scroll into .room (no overscroll-behavior:contain on them); .room itself never bounces (none)', () => {
  expect(phone).not.toMatch(/\.tab-content, body\.arena-room \.chat-messages \{ overscroll-behavior: contain/);
  expect(phone).not.toMatch(/\.chat-messages \{[^}]*overscroll-behavior: (contain|none)/);
  expect(phone).toMatch(/body\.arena-room \.room \{[^}]*overscroll-behavior: none;/); // contain still bounces locally
});
// #368: the ▲/▼ expand mode is gone — the dock sticks to the bottom of the .room scroller, the tabs are a sheet.
test('no expand mode is left: no toggle rules, no expanded un-sticking, no rpanel--min', () => {
  expect(arena).not.toMatch(/rpanel-toggle|rpanel--min|aria-expanded="true"\]\) \.board-area-shell/);
});
test('the dock is sticky at the bottom of .room and the stage takes the leftover height', () => {
  expect(phone).toMatch(/body\.arena-room \.rail > \.rdock \{[^}]*position: sticky; bottom: 0;/);
  expect(phone).toMatch(/body\.arena-room \.rail > \.stage \{[^}]*flex: 1 1 0; min-height: 0;/);
  expect(phone).toMatch(/body\.arena-room \.board-area-shell \{ top: var\(--seatcard-h\); z-index: 20; \}/);
});
