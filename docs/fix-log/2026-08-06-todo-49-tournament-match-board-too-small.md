# Fix log entry — 2026-08-06 16:42

## Prompt

"Do #49 in TODO" — TODO.md #49: the board on a live tournament match
(`tournament-match.html`) renders noticeably smaller than the same board on a
casual room (`room.html`), on both mobile and desktop. `docs/instruction/B49-...md`
gave a proposed approach (remove a `max-width: 640px` cap fighting `board.js`'s
`resize()`, and sync a `769–900px` breakpoint gap) and required real-browser
verification before considering it done — no unit test can catch a layout bug
like this.

## Action

Read the proposed fix in `docs/instruction/B49-...md` and applied both parts in
[client/css/tournament.css](client/css/tournament.css):

1. Removed `max-width: 640px` from `.match-board-canvas-wrap` — `board.js`'s
   `resize()` already computes a correct size (up to its own 860px cap) from
   its container, and the fixed 640px CSS cap was fighting it.
2. Synced `.match-shell`'s single-column breakpoint from `900px` to `768px`,
   matching `room.css`'s mobile-bleed breakpoint for the shared
   `.board-area-shell`/`.board-area` classes, closing the `769–900px` gap
   where the layout had already gone single-column but the board card still
   carried desktop height/padding.

**Real-browser verification (required by instruction.md, no unit test exists
for this) surfaced a third, more significant bug that the proposed fix alone
did not resolve.** Scripted a full live tournament match end-to-end
(`tournament:create` → register two guests → `tournament:start` →
`report_time`/`confirm_time` → both `tournament:ready` → `InProgress`) via a
throwaway `socket.io-client` script, then loaded the real
`tournament-match.html` with a valid session token in Playwright (Chromium) at
1440px/800px/390px. After fix (1) and (2) above, the board canvas measured a
flat **246×246px at both 1440px and 800px viewports** — i.e. still broken,
just no longer capped at exactly 640px.

Root cause: `.board-area-shell` is a direct child of `.match-board-wrap`,
which is `display: flex; flex-direction: column; align-items: center;`. On
`room.html`, the equivalent `.board-area-shell` is instead a direct grid item
of `.room` (`display: grid`), whose default `align-self: stretch` gives it the
full column width for `board.js`'s `resize()` to measure and size the canvas
into. Under `.match-board-wrap`'s flex `align-items: center`, `.board-area-shell`
had no such stretch and shrank to fit its own content — which starts as the
canvas's tiny intrinsic size — so `resize()` read back a small `clientWidth`
and the board stabilized small regardless of viewport width. Fixed by adding
`.match-board-wrap > .board-area-shell { align-self: stretch; width: 100%; }`,
scoped to that one child so `.match-clocks`/`.match-actions` (which rely on
the parent's `align-items: center` to stay centered) were untouched.

Bumped the shared cache-bust version (`client/*.html`, `client/js/*-entry.js`)
`?v=63 → ?v=64` per the CSS-change rule in `CLAUDE.md`.

## Decision

Went beyond the literal instruction.md proposal because the mandatory
browser-verification step it specified is what caught that the proposed fix,
alone, did not actually resolve the reported bug — the board was still ~246px
regardless of screen width after applying only the two originally-suggested
changes. Fixing the flex-collapse is squarely inside #49's stated scope ("board
too small/inconsistent"), not a speculative extension, so it was folded into
this same fix rather than filed as a new TODO item.

Did not touch `board.js`'s `resize()` (explicit boundary in instruction.md) —
the actual defect was the CSS layout starving it of a correct container width
to measure, not the sizing algorithm itself.

Did not bundle the right-column `300px` vs. `clamp(320px, 28vw, 420px)`
inconsistency (instruction.md's item 3) — none of the three lines changed here
touch that column-width declaration.

No Jest unit test added — this is a pure CSS/layout defect with no existing
test infrastructure for visual layout in this repo (per instruction.md and
`CLAUDE.md`'s bug-fix-workflow rule, real-browser verification is the
correct/only check here, not a unit test).

## Summary output

`npm test`: 806/806 passing (unchanged — CSS-only fix, no server code
touched). Verified via a real running server + Chromium (Playwright) against a
throwaway DB (moved `server/db/gomoku.db` aside before starting the server,
restored the original file — checksum-verified identical — after; server
process killed):

- Tournament match canvas width, before fix → after fix:
  - 1440px desktop: 246px → **492px**
  - 800px tablet: 246px → **408px**
  - 390px mobile: 382px → 358px (mobile path was width-driven already, minor
    change from the breakpoint sync)
- Swept 769/800/850/900px to confirm the breakpoint-gap is gone: canvas now
  scales continuously (377px/408px/458px/508px) with no discontinuity.
- Cross-checked `room.html`'s board still renders large (734px canvas on an
  idle 1440px-wide room) — confirms the shared `resize()`/`.board-canvas-wrap`
  behavior used as the baseline was not disturbed by this fix.
