# B493 — Rated games: running clock, absence window, abandon/abort results (PS-8)
**Status:** OPEN
**Area:** server/socket/handlers/{DisconnectHandler,GameHandler}.js, TimerManager, client room-socket/game-ui, i18n, replay.js
**From:** features/presence-status (planning §3, Q1/Q2/Q11/Q12/Q13 A), 2026-11-27   **Depends:** #487
## Scope
1. Rated: clock keeps running; window W (per_game/blitz clamp(0.1×(base+40×inc),30,120) s; per_move = per-move s), counted on the absent player's turn, not refilled within a game.
2. Expiry → absent player loses, reason `abandon`, rated. Abortable (no action by each side, Swap2 decisions count) absent 30 s → `abort`, void.
3. Both gone 15 s → void. Outage window (≥30 % and ≥10 sockets drop in 5 s → 2 min: expiries void).
4. Old-client compat: running `timerSync` with `game:interrupted`; i18n + `reasonMap` for `abandon`/`abort`.
## Don't
- Touch tournament (Q9 A) or casual (#494). Keep #422 page-bounce rule.
## Traps
- diag-page-sync rule: re-verify (a)-(c).
## Done when
- DisconnectHandler tests per case; old-client clock test; npm test green.
