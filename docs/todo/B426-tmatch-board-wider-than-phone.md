# B426 — Tournament match board wider than a 390px phone viewport
**Status:** ✅ FIXED 2026-11-25 — fix/426-tmatch-board-phone-width → dev; real-browser layout spec at 360/375/390 ([fix-log](../fix-log/2026-11-25-426-tmatch-board-phone-width.md))
**Area:** client/tournament-match.html (`#board-wrap`, `#match-canvas`), client/css/tournament.css:258, client/js/board.js (sizing)
**From:** #425 phone browser pass, 2026-11-21 (Renju tournament, Chromium 390x844, own DB)   **Depends:** —

## Problem
On `tournament-match.html` at 390 px width, `#board-wrap` measures 420 px (left = -15) and the svg 408 px (left = -9): the board is clipped on both sides (row labels at the left edge, column O at the right edge cut). No horizontal scroll, so it is easy to miss. Seen on a 15x15 Renju game; NOT yet checked on a non-Renju tournament, so it may predate #425.
## Scope
1. Reproduce at 390 / 375 / 360 px on a non-Renju tournament match (decides if #425 caused it).
2. Root cause: who sizes the board (board.js min size vs. container width), then fit it to the viewport.
## Don't
- Don't touch room.html board sizing; this page only.
## Traps
Fixed min size in the renderer vs. CSS `width:100%` wrap; any `client/` edit → `node scripts/cache-bust.js --write`; add a jsdom/real-browser regression check (measure wrap width <= viewport).
## Why this way
Root cause first (rule 3): the page-level clip is the symptom.
## Done when
- At 360/375/390 px the board and its labels sit fully inside the viewport; regression test kept.
