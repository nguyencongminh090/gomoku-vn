# 2026-10-12 08:06 — #247 ruleSet startsAt/endsAt accept impossible dates
## Prompt
"Do #237 #238 #247 (sequencely and commit + merge)"
## Root cause
isDay validated with Date.parse, which normalises 2026-02-31 to Mar 3 instead of returning NaN.
## Fix
TournamentManager._validateRuleSet isDay: also require new Date(v).toISOString().slice(0,10) === v. Still drops to null, never rejects. This commit also carries the previously-uncommitted startsAt/endsAt normalisation (+ its tests) from ui/tournament-modal-arena, since the fix lives inside it. Branch fix/247-isday-impossible-dates.
## Verification
Added cases: 02-31, 04-31, non-leap 02-29 dropped; leap 2028-02-29 kept. npm test run before commit. Server-only; no ?v= bump.
