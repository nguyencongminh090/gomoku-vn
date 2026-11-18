# B413 — Room phone clocks: one scoreboard row on top (K1)
**Status:** ✅ DONE 2026-11-17 (merged dev; real-phone check not done)
**Area:** client/css/room-arena.css, client/js/room-ui.js (seat cards/playerClock), room-stage.js (bubbles anchor to seat card)
**From:** user report 2026-11-17 (hand covers clock on phone); mockup pick K1 in features/room-clock-mobile/   **Depends:** —

## Problem
Phone room: opponent card top, my card bottom with clock at the right edge, right under the thumb that taps the lower board.
## Scope
1. ≤768px: both seat cards as one 2-cell row under the nav (opponent left, me right, mirrored); bottom card gone. Spec: DESIGN.md "Bàn chơi phone clocks".
2. Spectator view: seat #2 left, #1 right (seatOrder unchanged).
3. Recompute sticky/board-height invariants (one card height instead of two) — see memory/platform invariants: `--board-h`, board cap formula `2·pcard`.
## Don't
- Touch desktop/tablet layout, BoardRenderer, TimerManager/timer-sync logic (display only).
## Traps
- Speech bubbles (room-stage.js) anchor to the seat card — re-anchor to the cell.
- Stand-up button, empty seat "Ngồi vào", ready state must still fit a half-width cell.
- Clock work → .claude/rules/diagnostic-page-sync.md.
## Done when
- jsdom test: phone layout puts both clocks in the top row; real-browser 390×844 + 375×667 light/dark shots; cache-bust OK.
