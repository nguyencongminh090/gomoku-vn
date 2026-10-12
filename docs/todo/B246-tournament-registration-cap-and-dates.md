# B246 — Registration cap/close time; enforce startsAt/endsAt
**Status:** ✅ FIXED 2026-10-12 — tournament registration cap + close day (+ endsAt closes registration) (fix-log: docs/fix-log/2026-10-12-tournament-registration-cap-and-dates.md)
**Area:** server/managers/tournament/TournamentManager.js (_validateRuleSet, registerPlayer), sweep, client create form
**From:** tournament backend review, 2026-10-12 (user: "Open Task (gather all in once)")   **Depends:** —

## Problem
No max players, no registration close; startsAt/endsAt are informational only (nothing starts/ends by date).
## Scope
1. Plan fields: maxPlayers, registrationClosesAt, enforcement of dates.
2. Backend guards + sweep; client form; tests.
## Don't
- Don't auto-start without an explicit decision.
## Why this way
Not yet decided — confirm at pickup. docs/knowledge: none.
## Done when
- Cap and close enforced; tests + browser pass.
