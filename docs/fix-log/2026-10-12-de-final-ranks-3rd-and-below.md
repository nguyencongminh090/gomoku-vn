# 2026-10-12 — #243 double-elim ranks 3rd and below by losers-bracket exit round
## Prompt
"Do #239 240 243 244 242 245 246 (sequencely, commit after each)"
## Root cause
_assignDoubleElimFinalRanks only set champion/runner-up; no elimination-order data was used for the rest.
## Fix
New pure doubleElim.computeEliminationGroups (losers rounds latest→earliest, byes skipped); manager assigns ranks from 3, ties share the rank (1+players ahead, as standings.js).
## Verification
Pure tests for sizes 2,3,4,5,8 (full coverage, no dupes) + exact order for 4 and shape for 8; 4-player manager test asserts ranks 3,4. npm test before commit. Server-only.
