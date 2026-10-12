# B240 — Verify/fix guest tournament entries after restart
**Status:** OPEN
**Area:** server/managers/tournament/TournamentManager.js (_hydrateTournament, _findEntryIdByUserId), db tournament_players
**From:** tournament backend review, 2026-10-12 (user: "Open Task (gather all in once)")   **Depends:** —

## Problem
Guest entries persist player_id=null; hydrated entry has userId null so the guest can no longer be matched to their pairings.
## Scope
1. Check whether guests can join tournaments at all.
2. If yes: persist a guest id (column + migration), hydrate it.
3. Test reload with a guest.
## Don't
- Don't touch member entries.
## Why this way
Not yet decided — confirm at pickup. docs/knowledge: none.
## Done when
- Guest keeps access after reload, or guests confirmed unsupported (CLOSED).
