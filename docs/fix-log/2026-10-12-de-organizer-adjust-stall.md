# 2026-10-12 08:03 — #237 Double-elim: organizer-adjusting a match stalls the bracket
## Prompt
"Do #237 #238 #247 (sequencely and commit + merge)"
## Root cause
organizerAdjustPairing set OrganizerAdjusted (no winner) then called _advanceIfRoundComplete, which returns early for double_elim. Nothing recorded a result, so _syncDoubleElimPairings never created the next match.
## Fix
TournamentManager.organizerAdjustPairing: for double_elim call _createReplayPairing (resets the same pairingId to Negotiating, as void/replay does) and return. Swiss/RR path untouched. Branch fix/237-de-adjust-stall. No client change, no ?v= bump.
## Verification
2 tests in TournamentManager.test.js (DE reset + still playable; swiss unchanged). npm test run before commit. Not verified in a real browser (server-only).
