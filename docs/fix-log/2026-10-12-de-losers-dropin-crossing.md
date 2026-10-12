# 2026-10-12 — #244 double-elim losers drop-in crossed on even winners rounds (no early rematch)
## Prompt
"Do #239 240 243 244 242 245 246 (sequencely, commit after each)"
## Root cause
Drop round paired survivors[i] with wrLosers[i]; W2M{i} loser shares a half with the L1M{i} survivor, so they could rematch at once.
## Fix
In generateBracket, even winners rounds use the reversed wrLosers order; winners bracket and seeding untouched.
## Verification
New shape tests for 8/16/32 (first drop round never pairs same-half) + every W loser mapped once for 4/8/16; existing 4-player flows unchanged. npm test before commit. Server-only.
