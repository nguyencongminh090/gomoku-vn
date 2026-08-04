# Fix log entry — 2026-08-02 01:51

## Prompt

Backend TODO Phần B #5 (review 5.5): the idle-room cleanup interval in [server/managers/RoomManager.js:49-52](server/managers/RoomManager.js#L49-L52) was scheduled with a bare `60_000` literal plus a "Check every 60 seconds" comment, even though `server/config.js` opens with "All constants are defined here. Never use magic numbers elsewhere." and already owns the timeout that scan enforces (`IDLE_TIMEOUT_MS`). `instruction.md` has no §B5 entry — no reviewer guidance beyond the `TODO.md` description.

## Action

Added `IDLE_SCAN_INTERVAL_MS = 60_000` to [server/config.js:12](server/config.js#L12), directly under `IDLE_TIMEOUT_MS` and exported alongside it, then pointed the `setInterval` call at `config.IDLE_SCAN_INTERVAL_MS`. Same cadence as before — behavior is unchanged by design.

## Decision

`TODO.md` called this a pure rename needing no test of its own; wrote one anyway, since `CLAUDE.md`'s bug-fix rule asks for coverage whenever the affected code can reasonably get it, and RoomManager had no test file at all until now. The test mocks `config` with a **sentinel** interval of `12_345` rather than asserting against the real 60_000: asserting the real value would pass with the old literal still in place (both are 60_000), making it a tautology instead of a regression guard. This creates `server/tests/RoomManager.test.js`, which TODO Phần B #7 (room quota per IP) also needs — that item can extend this file rather than create it.

## Summary output

`npm test`: 184/184 passing, 10 suites green (was 180/9). New file [server/tests/RoomManager.test.js](server/tests/RoomManager.test.js) with 4 kept tests: `setInterval` is called with the sentinel from config; advancing fake timers by one interval fires exactly one `_idleCleanup` (and 4 after four intervals, with none at interval-minus-1ms); the real config value is a positive number; and it is strictly less than `IDLE_TIMEOUT_MS` (a cadence at or above the timeout would let an idle room survive up to twice as long as intended). **Mutation-checked:** restoring the `60_000` literal in a scratch copy fails 2 of the 4 tests, confirming they actually guard this fix; the file was restored from backup immediately after and `git diff` verified clean. Server-only change — no client code or socket wiring touched, so per the verification note from the previous item, unit tests are sufficient here and no browser run was needed.
