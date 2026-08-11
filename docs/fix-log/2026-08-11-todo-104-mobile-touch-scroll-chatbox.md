# Fix log entry — 2026-08-11 22:29

## Prompt

Do #104 (TODO.md) — mobile: tapping the board sometimes focuses the chat
input (keyboard pops up) and/or scrolls the page.

## Action

Two independent, compounding defects in `docs/todo/B104-*.md`'s analysis:

1. `client/js/board.js`'s `_onTouchEnd` called `e.preventDefault()` AFTER
   the `!interactive || !isMyTurn || !onCellClick` early-return guard, so it
   never ran while it wasn't the player's turn (opponent's turn, pre-game,
   spectating) — letting the browser fire its default post-touch behavior:
   a synthetic `click` ~300ms later that could focus `#chat-input`, and a
   page scroll if the finger moved slightly during the tap.
2. `client/css/game.css`'s `.board-canvas-wrap canvas` (room page) was
   missing `touch-action: none`, unlike `#match-canvas` in `tournament.css`
   — without it the browser could start a pan/scroll gesture before the JS
   touch handler even ran, a race `preventDefault()` alone can't close.

Both fixes were already present, uncommitted, in the working tree exactly
as `docs/todo/B104-*.md`'s Solution section specifies (dev had apparently
staged them ahead of formal tracking): `preventDefault()` moved to the
first line of `_onTouchEnd`, and `touch-action: none` added to the room
canvas rule.

## Decision

Applied the fix exactly as scoped in the bug report — no extension beyond
the two named defects. Verified client-side test infra exists
(`client/tests/*.test.js`, jsdom via jest) contrary to `CLAUDE.md`'s
default assumption that `client/js/` has none, so wrote a real unit test
rather than skipping. No test written for the CSS `touch-action: none`
change itself — a CSS static property isn't meaningfully assertable via
jsdom (no real layout/touch engine); confirmed by reading the rule back
against the file.

**Test coverage:** new `client/tests/board-touch-scroll-prevention.test.js`
(4 cases — not interactive, interactive-but-not-my-turn, no `onCellClick`
wired, and the player's own turn as a no-regression check) — all assert
`preventDefault()` is called unconditionally on `touchend`. Verified the
test actually catches the regression by stashing `board.js`'s fix and
re-running: 3/4 cases failed as expected, confirming the test isn't a
false positive. `npm test`: 49 suites / 1068 tests passing after restoring
the fix.

Cache-busting: bumped `?v=101` → `?v=102` across every `client/*.html`
`<link>`/`<script>` tag and every `client/js/*.js` `?v=`-suffixed import
(mockups excluded per convention); verified with the single-value grep
check from `CLAUDE.md`.

## Summary output

- `client/js/board.js`: `_onTouchEnd` — `e.preventDefault()` moved before
  the early-return guard.
- `client/css/game.css`: `.board-canvas-wrap canvas` — added
  `touch-action: none`.
- `client/tests/board-touch-scroll-prevention.test.js`: new file, 4 tests.
- `?v=101` → `?v=102` across all `client/*.html` and `client/js/*.js`
  (excluding the two frozen `*-mockup.html` files).
- `docs/todo/B104-*.md` marked `✅ ĐÃ XONG`; `TODO.md` #104 line added with
  `✅` prefix in the same commit. `instruction.md`/`docs/instruction/B104-*.md`
  added alongside.
