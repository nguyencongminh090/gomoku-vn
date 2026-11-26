# B495 — Repeat abandonment: events table + limits (PS-10)
**Status:** ✅ DONE 2026-11-27 — migration 027 `abandonment_events` (kind CHECK abandon|abort, FK users CASCADE, idx user_at + at); `AbandonmentService` (record / recent / budgetFor / cooldownLeftMs / prune, best-effort, guests in memory per guest id); DisconnectHandler records on abandon/abort only and halves W for a repeat leaver; MatchHandler `MATCH_COOLDOWN` with `{minutes}` (lobby-home passes vars); hourly prune in server/index.js. Tests: abandonment-limits (in-memory DB), rated-absence #495 block, MatchHandler cooldown.
**Area:** server/db (migration), server/managers, MatchHandler, server/index.js prune
**From:** features/presence-status (planning §3, Q5/Q12 A), 2026-11-27   **Depends:** #493
## Scope
1. `abandonment_events(user_id, game_id, kind, at)` via the user_version migration runner; hourly prune > 7 days.
2. ≥ 3 abandon/abort in 24 h → W halved (floor 15 s) + 10 min quick-match cooldown. Guests: per guest id in memory; never per IP.
## Done when
- Migration + limit tests; restart/outage-void games never recorded.
