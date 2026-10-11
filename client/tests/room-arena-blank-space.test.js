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
test('the panel toggle is sticky right under my card, and the panel clips without becoming its scroll container', () => {
  expect(phone).toMatch(/\.rpanel-toggle \{[^}]*position: sticky; top: calc\(2 \* var\(--pcard-h\) \+ var\(--board-h, 100vw\)\)/);
  expect(phone).toMatch(/body\.arena-room \.rpanel \{ overflow: clip; \}/);
  expect(phone).toMatch(/:has\(#chat-input:focus\) \.rpanel-toggle \{ position: relative; top: auto; \}/);
});
