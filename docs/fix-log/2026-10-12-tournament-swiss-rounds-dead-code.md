# 2026-10-12 — #239 swissRounds ruleSet branches removed (dead code)
## Prompt
"Do #239 240 243 244 242 245 246 (sequencely, commit after each)"
## Root cause
_validateRuleSet never kept swissRounds, so 'ruleSet.swissRounds ||' in start/hydrate could never fire.
## Fix
Deleted both dead branches (option 2b; no client UI per Don't). Round count = ceil(log2 n).
## Verification
Test asserts swissRounds is stripped and 5 players → 3 rounds. npm test run before commit. Server-only.
