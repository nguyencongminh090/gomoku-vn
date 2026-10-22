# 2026-10-16 15:45 — #255 follow-up: migration runner race + duplicate numbers
## Prompt
Review #255 (done by Sonnet) → "fix #1 #2"
## Root cause
1. migrate.js read user_version once before the loop; a second connection booting concurrently waited on the
   IMMEDIATE lock, then re-ran a migration the first had applied (`duplicate column name`, boot crash).
2. listMigrations never rejected two files with the same NNN; both ran (or a later one was skipped forever).
## Fix
Re-read user_version inside the IMMEDIATE transaction and skip if already >= version (log only when applied).
listMigrations throws on a duplicate number; listing now happens before the baseline step so nothing runs.
## Verification
server/tests/db-migrate.test.js: +2 tests (simulated concurrent boot on a shared file; duplicate 004_x/004_y),
both failed before the fix. npm test: 3256 pass. Baseline-trusts-001-003 gap (review item #3) not addressed.
