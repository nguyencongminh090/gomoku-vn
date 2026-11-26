# B496 — Fair-play: per-game presence summary for staff (PS-11)
**Status:** OPEN
**Area:** server/db (migration), GameHandler.handleGameEnd, RatingIntegrityService/admin page, i18n rules text
**From:** features/presence-status (planning §4, Q6 A), 2026-11-27   **Depends:** #487
## Scope
1. In-memory counters per player per rated game; one write next to saveGame: `game_presence`.
2. 90-day prune (hourly); staff-only view (`rating.integrity`); player-facing rules/privacy line.
## Don't
- Any automatic penalty; any raw event stream.
## Done when
- Tests: counters, write once, perm check, prune.
