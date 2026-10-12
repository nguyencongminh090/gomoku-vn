# B243 — Double-elim placements below 2nd
**Status:** ✅ FIXED 2026-10-12 — double-elim ranks 3rd and below by losers-bracket exit round (fix-log: docs/fix-log/2026-10-12-de-final-ranks-3rd-and-below.md)
**Area:** server/managers/tournament/TournamentManager.js (_assignDoubleElimFinalRanks)
**From:** tournament backend review, 2026-10-12 (user: "Open Task (gather all in once)")   **Depends:** —

## Problem
Only champion and runner-up get finalRank; others null.
## Scope
1. Track elimination order (losers-bracket exit).
2. Assign ranks (ties by round of exit).
3. Tests for sizes 2,3,4,5,8.
## Don't
- Don't use win count as rank.
## Why this way
Not yet decided — confirm at pickup. docs/knowledge: none.
## Done when
- All entries ranked; tests green.
