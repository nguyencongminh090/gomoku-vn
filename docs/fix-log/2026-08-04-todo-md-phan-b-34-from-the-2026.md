# Fix log entry — 2026-08-04 09:20

## Prompt

TODO.md Phần B #34 (from the 2026-08-03 security-review recheck): `game:time_accept`/`game:time_decline` in [server/socket/handlers/GameHandler.js](server/socket/handlers/GameHandler.js) checked `room._timeRequestPending.from === user.userId` (blocking only self-accept/self-decline) but never checked whether the caller was actually one of `room.gameState.players` — unlike the adjacent `game:request_time`, which already checks `engine.players.find(p => p.userId === user.userId)`. A spectator could grant/deny bonus time on behalf of a real opponent after that opponent used up `TIME_REQUEST_FREE`, defeating the stalling-defense mechanism.

## Action

Copied the existing `engine.players.find(...)` pattern from `game:request_time` into the top of both `game:time_accept` and `game:time_decline`, before the existing `_timeRequestPending` checks, emitting `game:error` with `'Bạn không phải người chơi.'` and returning early on a non-member.

## Decision

Followed `instruction.md` §B34 exactly: kept the check at the handler layer (`GameHandler.js`), not inside `GameEngine`, since `_timeRequestPending` is `room` state, not `GameEngine` state — matching where `game:request_time`'s equivalent check already lives, rather than moving this state into `GameEngine` purely for B33/B34 symmetry. Reused the exact error event/format (`game:error`, `{ message }`) `game:request_time` already uses.

## Summary output

`npm test`: 365/365 passing (was 361). New [server/tests/GameHandler.test.js](server/tests/GameHandler.test.js) (this handler previously had zero test coverage) — 4 cases: a non-member ("spectator-1", not in `gameState.players`) calling `game:time_accept`/`game:time_decline` while a request is pending is rejected with `'Bạn không phải người chơi.'` and `room._timeRequestPending` survives unconsumed, plus 2 counterpart cases confirming a real opponent player can still accept/decline normally. Mocked `../db/database` in the new test file (the module isn't exercised by these two handlers, only by `handleGameEnd`) to avoid a real SQLite handle keeping the Jest process alive after the run — discovered when a first draft of the file passed in isolation with `--forceExit` but hung the full `npm test` run without it; mocking `database` fixed this and the fix required no changes to any other test file. Mutation-checked: reverted just [server/socket/handlers/GameHandler.js](server/socket/handlers/GameHandler.js) (test file unchanged) — both spectator-guard cases failed exactly as expected; restored the fix, all green again.
