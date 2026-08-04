# Fix log entry — 2026-08-01 22:30

## Prompt

Backend fix #3 (security review 2026-08-01): `handleGameEnd` persisted a game row to SQLite even when called with `{noScore: true}` — the score-update block at [GameHandler.js:636](server/socket/handlers/GameHandler.js#L636) already checked `!noScore`, but the DB-persist block right below it at [GameHandler.js:653](server/socket/handlers/GameHandler.js#L653) only checked `engine && engine.result`, so every disconnect-cancelled game (both players drop mid-match) still wrote a full row with `moveHistory` JSON into `games`, growing the table on every double-disconnect regardless of whether the match actually counted.

## Action

Added `&& !noScore` to the persist condition at [GameHandler.js:653](server/socket/handlers/GameHandler.js#L653), mirroring the score block above it exactly.

## Decision

Confirmed the only caller of `noScore: true` is [DisconnectHandler.js:138](server/socket/handlers/DisconnectHandler.js#L138) (both-players-gone grace expiry) and grepped `server/`, `client/js/` for any consumer of `reason: 'disconnect'` game rows — none found, so no reader depends on these rows existing.

## Summary output

`npm test`: 144/145 passing, same baseline (no regression).
