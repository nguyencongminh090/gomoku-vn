# 2026-10-16 16:30 — #255 follow-up: real multi-process race verification
## Prompt
"Test race 2 process" → "commit and merge to dev"
## Root cause
n/a — verification of 54bfca2, whose jest test only simulates the race inside one process.
## Fix
server/scripts/race-migrations.js [procs] [rounds]: N node processes run runMigrations on one file at the same
instant (slow 004 forces lock waits). Kept out of npm test (timing-based, ~2 s/round).
## Verification
Old runner (3a79ae3): 3 of 4 processes crash per round ("duplicate column name: a").
New runner: 4×3 and 8×10 processes all OK; user_version=5, 004 applied exactly once (300000 rows).
