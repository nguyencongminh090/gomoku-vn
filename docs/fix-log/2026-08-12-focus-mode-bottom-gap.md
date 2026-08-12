# Fix log entry — 2026-08-12 00:00

## Prompt

User report (with screenshot): "Focus mode is not Full Screen? There is a
big gap at bottom." — asked to analyze and optimize the room page's
layout/CSS/board/chatbox.

## Action

Clarified first that the bottom-right icon triggers `.room--focus`, a CSS
overlay (not the browser Fullscreen API) — that's expected behavior, not
itself a bug. Reproduced the reported gap with two real guest sessions via
Playwright against a throwaway server + throwaway DB (moved the real
`server/db/gomoku.db` aside per the Playwright/db-safety rule, restored it
after — the actual production server on port 3000, already running for the
user, was never touched).

Root cause: `.room--focus .board-area`'s `padding-bottom: 140px` and
`board.js`'s matching `resize()` `bottomReserve` both reserved a flat
140px dead zone at the bottom of the viewport for the fixed chat input +
focus button, even though `#chat-input-wrapper` only needed enough
clearance for its own `bottom: 85px` placement (~132px) — a placement that
was itself far more generous than needed, since `.btn-focus` already sits
safely at `bottom: 20px` with no overlap. Because `board.js` derives the
canvas's pixel size from `window.innerHeight - topReserve - bottomReserve`,
the oversized reserve directly shrank the board and the leftover budget
rendered as visible empty space around the floating chat input.

## Decision

Moved `#chat-input-wrapper` to `bottom: 20px` (hugging the edge next to
`.btn-focus`, which was already there — no horizontal overlap since the
input is centered and the button sits at `right: 20px`), and shrank the
matching CSS `padding-bottom` (140→80px) and JS `bottomReserve` (140→80)
to the new, tighter clearance. Adjusted `.room--focus .float-messages`'s
`bottom` (145→78px) to stay stacked above the chat input at its new
position. No unit test written — `client/js/board.js`'s `resize()` is
pixel-budget/layout logic with no jsdom-assertable behavior (no real
layout engine), consistent with prior CSS-only fixes in this log (e.g.
`touch-action: none` in #104's fix). Verified instead by direct visual
measurement (`getBoundingClientRect()` on `.board-area-inner`, `#chat-input-wrapper`,
`.btn-focus`) before/after at 1280×800, 1920×1000 (matches the reported
screenshot's aspect), and mobile 390×844 — board grew from 508×508 to
568×568 at 1280×800, chat input now sits ~32px below the controls instead
of floating in a ~90px dead gap. `npm test`: 42 suites / 988 tests passing
on this `main`-based branch.

## Summary output

- `client/css/game.css`: `.room--focus .board-area` `padding-bottom`
  140px→80px; `.room--focus #chat-input-wrapper` `bottom` 85px→20px;
  `.room--focus .float-messages` `bottom` 145px→78px.
- `client/js/board.js`: `resize()`'s focus-mode `bottomReserve` 140→80,
  mirroring the CSS change.
- `?v=96` → `?v=97` across all `client/*.html` and `client/js/*.js`
  (excluding the frozen `*-mockup.html` files).
