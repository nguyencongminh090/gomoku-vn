# B242 — Persist seeds; deterministic seeding on hydrate
**Status:** ✅ FIXED 2026-10-12 — tournament seeds assigned + persisted at start; hydrate orders by seed (fix-log: docs/fix-log/2026-10-12-tournament-persist-seeds.md)
**Area:** server/managers/tournament/TournamentManager.js, db tournament_players.seed
**From:** tournament backend review, 2026-10-12 (user: "Open Task (gather all in once)")   **Depends:** —

## Problem
entry.seed is never set. Seeds = registration order; hydrate rebuilds the bracket from ORDER BY registered_at (ms ties could swap seeds and corrupt the bracket).
## Scope
1. At start, assign + persist seed.
2. Hydrate and engines use seed order.
3. Optional (separate): organizer reseed/shuffle UI.
## Don't
- Don't add reseed UI in this item.
## Why this way
Not yet decided — confirm at pickup. docs/knowledge: none.
## Done when
- Reload yields identical bracket; test with same-ms registrations.
