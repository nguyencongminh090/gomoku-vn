# B245 — Round robin tiebreak: head-to-head / wins instead of Buchholz
**Status:** ✅ FIXED 2026-10-12 — round-robin final ranks use head-to-head, then wins, then Sonneborn-Berger (fix-log: docs/fix-log/2026-10-12-rr-tiebreak-head-to-head.md)
**Area:** server/managers/tournament/standings.js, server/managers/tournament/TournamentManager.js (_completeTournament)
**From:** tournament backend review, 2026-10-12 (user: "Open Task (gather all in once)")   **Depends:** —

## Problem
In round robin every player faces the same opponents, so Buchholz/Sonneborn-Berger do not separate anyone; ties share rank.
## Scope
1. Format-aware tiebreak order for round_robin.
2. Tests incl. 3-way tie.
## Don't
- Don't change Swiss tiebreaks.
## Why this way
Not yet decided — confirm at pickup. docs/knowledge: none.
## Done when
- RR ties resolved by H2H/wins where possible.
