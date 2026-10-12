# B244 — Double-elim losers bracket: cross drop-in order to avoid rematches
**Status:** ✅ FIXED 2026-10-12 — double-elim losers drop-in crossed on even winners rounds (no early rematch) (fix-log: docs/fix-log/2026-10-12-de-losers-dropin-crossing.md)
**Area:** server/managers/tournament/pairing/doubleElim.js
**From:** tournament backend review, 2026-10-12 (user: "Open Task (gather all in once)")   **Depends:** —

## Problem
Winners-round losers drop in at the same index each round, which invites early rematches.
## Scope
1. Alternate reverse/cross mapping of wrLosers per round.
2. Update bracket-shape tests (sizes 4,8,16).
## Don't
- Don't change winners bracket or seeding.
## Why this way
Not yet decided — confirm at pickup. docs/knowledge: none.
## Done when
- No avoidable rematch in the first drop round; tests green.
