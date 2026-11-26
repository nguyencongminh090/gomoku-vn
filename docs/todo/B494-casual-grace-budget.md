# B494 — Casual games: cumulative grace budget (PS-9)
**Status:** OPEN
**Area:** server/socket/handlers/DisconnectHandler.js
**From:** features/presence-status (planning §3, Q3 A), 2026-11-27   **Depends:** #493
## Scope
1. Casual keeps the pause, but each player has 60 s of grace per game in total; reconnecting does not refill it.
2. Budget spent → void (today's result).
## Done when
- Tests: repeated drops end the game once 60 s total is spent (problem 2 regression).
