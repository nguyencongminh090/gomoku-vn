# 2026-11-25 17:10 — #470 Tournament match board renders at 150 px on desktop
## Prompt
"Do #468 - 471"
## Root cause
Layout, as suspected. room.css desktop leaves `.board-area` `flex: 0 0 auto` in a column shell with
`align-items: center` → shrink-to-fit. room.html only gets a real box via `body.arena-room`
(`.board-area` width/height 100%); tournament-match.html has no arena-room. `BoardRenderer.resize()`
hides the svg to measure `#board-wrap`, found ~0 px → 160 px floor → 150 px after cell rounding.
Mobile was fine because room.css @768 sets `.board-area { width: 100% }`.
## Fix
`client/css/tournament.css` @min-width 769: `.room .board-area { align-self: stretch }` (shell width)
and `.room .board-area-shell { height: auto }`. A height-filling first try gave 673 px but ran ~90 px
below the fold (room.css shell height `100dvh - 76px` assumes no page header above it); with auto
height resize()'s own "fit the viewport below my top" branch sizes the board. No board.js change.
fadeUp entry offset (noted in B470) left alone — transform only, out of scope.
## Verification
Probe (`verify.cjs e2e2`, PROBE_ONLY, new PROBE_W/PROBE_H): before svg 150 / wrap 150×150 / area 162;
after 1366×900 → 561 px (bottom 865), 1920×1080 → 748 px (bottom 1052), 390 → 389 px (unchanged).
Full e2e2 (real moves, five-in-row, draw, mid-game restart) passes. Actions row sits just below the
fold at 1366×900. New `client/tests/tournament-match-board-css.test.js` red before / green after.
