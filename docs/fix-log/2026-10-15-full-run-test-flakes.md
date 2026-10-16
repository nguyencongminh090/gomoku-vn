# 2026-10-15 23:21 — #252 compression + lobby-home suites fail in full npm test
## Prompt
Do #252
## Root cause
Both test-side; no product code wrong.
- compression: `rawGet` used the default keep-alive agent; in a slow full run the pooled socket idled past the server's keepAliveTimeout and the reused request got `ECONNRESET`.
- lobby-home: a test that fires `match:status {waiting:true}` leaves that instance's 1 s `setInterval(renderQuickMatch)` alive; under load it ticks after the next `boot()` and paints its stale state (`qm.searching_casual`, old count n:214) into the new test's `#qm-line`.
## Fix
compression.test.js: `agent: false` (fresh socket per request). lobby-home.test.js: `stopPriorTicker()` (fires `match:status {waiting:false}`) at start of `boot()` and in `afterEach`.
## Verification
Full `npx jest` x4 after fix: 3239/3239 each (before: 1-2 fails in 3 of 4 runs). No client/server code touched, no ?v= bump.
