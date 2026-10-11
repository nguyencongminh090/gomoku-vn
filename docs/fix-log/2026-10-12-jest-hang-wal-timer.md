# 2026-10-12 05:45 — untracked: Jest never exits after a run (found during #224)
## Prompt
"do leftover test" — #224 report listed "jest without --forceExit hangs after the run (also on dev)".
## Root cause
`server/db/database.js` starts an hourly WAL-checkpoint `setInterval` at load and never `unref()`s it.
`--detectOpenHandles` points at database.js:184 for every suite that requires the DB. Same timer made
`node -e "require('./server/db/database')"` hang (noted in memory as a trap since 2026-10-09).
## Fix
Keep the handle and `walTimer.unref()`. The HTTP server already keeps the production process alive,
so the checkpoint still runs hourly there.
## Verification
- Regression test `server/tests/database-timer.test.js` (timer `hasRef() === false`); fails on HEAD's database.js.
- Plain `npx jest`: 160 suites / 2976 tests, exits on its own in ~12 s, no "did not exit" warning.
