# B284 — Docked rail squeezes the board at tablet widths (769–1024px)
**Status:** FIXED 2026-10-18 (uncommitted) — real-browser VERIFIED at 769/900/1024: default-collapsed, board 711/598/673 px (>= 560)
**Area:** client/css/room-arena.css (`@media (min-width:769px)`, `--rail-w`), client/js/room.js (default collapsed state)
**From:** ux-audit Rooms 2026-10-18, finding M1   **Depends:** ui/room-rail-dock merged

## Problem
364px rail leaves the board 501px at 900×700 and ≈380px at 769 wide; the board should stay the focus.
## Scope
1. Decide: default-collapsed below ~1024px (user choice still persists) vs narrower `--rail-w`.
2. Measure board size at 769/900/1024 before and after.
## Don't
- No board.js changes; no change ≥1280px.
## Why this way
Cheapest fix is a width-conditional default; stored user choice must still win.
## Done when
- Board ≥ ~560px at 900×700 by default, or collapse default applies there; test for the default rule; ?v= bumped.
