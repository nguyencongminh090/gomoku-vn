# B470 — Tournament match board renders at 150 px on desktop
**Status:** ✅ FIXED 2026-11-25 — desktop board-area stretches, shell height auto (fix-log 2026-11-25-470)
**Area:** client/css/room.css (.board-area), client/css/tournament.css (.match-board-canvas-wrap), client/js/board.js resize()
**From:** #467 follow-up verification 2026-11-25   **Depends:** —

## Problem
tournament-match.html at 1365×900 (and after reload / resize): svg 150 px, `#board-wrap` 150×150,
`#board-area` 162×162; mobile 390 px is fine (389 px). Cells ≈ 8 px → mis-clicks.
Same on dev code (main checkout); desktop layout CSS is unchanged vs origin/main, so production is
likely affected too (not checked on prod). Shot: `features/club-platform/screenshots/verify/e2e2-match-board-150px-desktop.png`.
Likely cause (unconfirmed): `.board-area { flex: 0 0 auto }` in a column flex shell is shrink-to-fit;
`resize()` hides the svg to measure, the wrap measures ~0 wide → `Math.max(size, 160)` floor.
Room page gets its width elsewhere. Also: `fadeUp` moves the board 12 px for ~0.75 s after entry.

## Scope
1. Confirm root cause; fix at the layout layer (not a board.js size floor).
2. Real-browser check desktop (1365×900, 1920×1080) + mobile; regression test where possible.

## Done when
- Desktop board fills the shell like room.html; mobile unchanged.
