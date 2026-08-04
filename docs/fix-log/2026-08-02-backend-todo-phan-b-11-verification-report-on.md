# Fix log entry — 2026-08-02 03:44

## Prompt

Backend TODO Phần B #11 (verification report on `3da53dd`): six shipped fixes had **no test protecting them**. The verification pass removed each one from a copy of the repo and re-ran the suite: fix #2 (real `isGuest`), #3 (`!noScore`), #4 (no resume while the opponent is still in grace), #6 (block kick when `interrupted`), #7 (one flood warning per window + disconnect on a streak) and #12 (lobby debounce) each came back **145/145 green** — nothing caught them. `docs/fix-log.md` records that tests for these were written and run at implementation time and then discarded, so `instruction.md` §B11 says to reconstruct the scenarios from each fix's own Evidence column rather than designing new ones. Test-only change: no production code touched.

## Action

Restored all six, reusing each fix-log entry's recorded scenario. New file [server/tests/flood-protection.test.js](server/tests/flood-protection.test.js) (9 tests, fix #7) captures the middleware the way it is registered — `init(io)` calls `io.use(fn)` — since it is not exported. New file [server/tests/save-game.test.js](server/tests/save-game.test.js) (10 tests, fixes #2 and #3) runs the real schema and real INSERT against an in-memory SQLite with foreign keys on. Extended [RoomManager.test.js](server/tests/RoomManager.test.js) (+3, fix #6), [DisconnectHandler.test.js](server/tests/DisconnectHandler.test.js) (+3, fix #4) and [lobby-delta.test.js](server/tests/lobby-delta.test.js) (+4, fix #12).

## Decision

Each restored test was checked by re-running the original mutation: revert the fix in a scratch copy of `server/`, run the suite, confirm it goes red, restore from backup. **Fix #12 needed the claim narrowed, and this is worth recording rather than glossing:** with the delta from Phần B #9 in place, removing the debounce guard no longer changes how many packets go out — extra flushes over unchanged state diff to nothing and emit nothing, so no packet-count assertion can detect it. Two attempts at a packet-based test both passed against the mutated code, i.e. they would have been false comfort. What the guard still guarantees is one scheduled timer per burst instead of one per call (15 call sites firing in a busy moment would otherwise queue 15 timeouts, each re-running `listRooms()` and a full diff), so the test asserts that via `jest.getTimerCount()` and says so in a comment. Fix #4's mutation also had to be redone: the first attempt produced a syntax error, so the suite "failed" for the wrong reason and proved nothing — replacing `if (otherStillAway)` with `if (false)` is the honest revert.

## Summary output

`npm test`: 261/261 passing, 14 suites green (was 232/12) — 29 tests added. **Mutation matrix, all six reverted one at a time against the full suite:** fix #2 → 1 failed; #3 → 1 failed; #4 → 2 failed; #6 → 1 failed; #7 → 2 failed; #12 → 1 failed. Every one now caught, where every one was previously missed. `git status` after the run confirms only test files changed — the harness restored `server/` from backup between mutations. No browser verification: this item adds no runtime behaviour.
