# B238 — Reject starting a tournament with fewer than 2 players
**Status:** ✅ FIXED 2026-10-12 — NOT_ENOUGH_PLAYERS guard in startTournament (fix-log: docs/fix-log/2026-10-12-tournament-start-min-2-players.md)
**Area:** server/managers/tournament/TournamentManager.js (startTournament)
**From:** tournament backend review, 2026-10-12 (user: "Open Task (gather all in once)")   **Depends:** —

## Problem
startTournament sets active with <2 entries; no rounds exist and nothing can complete it (only cancel).
## Scope
1. Guard: return { code: 'NOT_ENOUGH_PLAYERS' } before status change.
2. i18n/message code if the client surfaces it.
3. Tests: 0, 1, 2 entries.
## Don't
- Don't change draft→active for >=2.
## Why this way
Not yet decided — confirm at pickup. docs/knowledge: none.
## Done when
- Start with 0/1 entries errors, status stays draft.
