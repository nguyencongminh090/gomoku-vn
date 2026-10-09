# B196 — Dashboard shows "5+3" for per_game clocks (no increment there)
**Status:** ✅ FIXED 2026-10-09 — [fix-log](../fix-log/2026-10-09-todo-196-dashboard-clock-label.md)
**Area:** client (`lobby-home.js` ruleLine)
**From:** found while starting R3 (B197), 2026-10-09   **Regression of:** B195

## Problem
`ruleLine()` printed `min+inc` for `per_game`; the increment only applies in `blitz` (TimerManager.applyMove).
## Scope
blitz → `m+inc`; per_game → `m phút/ván` (or `Ns/ván`); per_move unchanged. Regression test.
