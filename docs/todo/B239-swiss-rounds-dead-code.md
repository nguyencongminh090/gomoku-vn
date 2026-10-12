# B239 — swissRounds ruleSet field read but never validated
**Status:** OPEN
**Area:** server/managers/tournament/TournamentManager.js (_validateRuleSet, startTournament, _hydrateFormatState)
**From:** tournament backend review, 2026-10-12 (user: "Open Task (gather all in once)")   **Depends:** —

## Problem
_validateRuleSet drops swissRounds, so the 'ruleSet.swissRounds ||' branches are dead; round count is always ceil(log2 n).
## Scope
1. Ask: expose organizer-set rounds or not.
2a. Validate (int 1..n-1) + client field, or 2b. delete dead branches.
3. Test.
## Don't
- Don't add client UI without a decision.
## Why this way
Not yet decided — confirm at pickup. docs/knowledge: none.
## Done when
- No dead branch; test covers the chosen behaviour.
