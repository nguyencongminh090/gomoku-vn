# B237 — Double-elim: organizer-adjusting a match stalls the bracket
**Status:** ✅ FIXED 2026-10-12 — DE adjust resets the match in place (fix-log: docs/fix-log/2026-10-12-de-organizer-adjust-stall.md)
**Area:** server/managers/tournament/TournamentManager.js (organizerAdjustPairing), PairingLifecycle.js
**From:** tournament backend review, 2026-10-12 (user: "Open Task (gather all in once)")   **Depends:** —

## Problem
organizerAdjustPairing sets OrganizerAdjusted (no winner), then _advanceIfRoundComplete returns early for double_elim; _recordCompletion/_syncDoubleElimPairings/_checkDoubleElimComplete never run, so the next match is never created. Also not restored on reload.
## Scope
1. Decide semantics: force a winner, or reset the match like void/replay.
2. For double_elim route through _recordCompletion (or reset in place).
3. Regression test per format (swiss/RR unaffected).
## Don't
- Don't change Swiss/RR adjust behaviour.
## Why this way
Not yet decided — confirm at pickup. docs/knowledge: none.
## Done when
- DE bracket continues after an adjust; survives reload. Fix-log entry + kept test.
