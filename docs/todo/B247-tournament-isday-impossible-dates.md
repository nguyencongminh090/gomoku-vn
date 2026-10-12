# B247 — ruleSet startsAt/endsAt accept impossible dates (2026-02-31)
**Status:** ✅ FIXED 2026-10-12 — round-trip date check (fix-log: docs/fix-log/2026-10-12-tournament-isday-impossible-dates.md)
**Area:** server/managers/tournament/TournamentManager.js (_validateRuleSet isDay)
**From:** tournament backend review, 2026-10-12 (user: "Open Task (gather all in once)")   **Depends:** uncommitted work on ui/tournament-modal-arena

## Problem
isDay uses Date.parse, which rolls 2026-02-31 over instead of rejecting.
## Scope
1. Round-trip check: new Date(v).toISOString().slice(0,10) === v.
2. Test valid/invalid/leap day.
## Don't
- Don't reject the tournament; keep drop-to-null.
## Why this way
Not yet decided — confirm at pickup. docs/knowledge: none.
## Done when
- Impossible dates become null; test kept.
