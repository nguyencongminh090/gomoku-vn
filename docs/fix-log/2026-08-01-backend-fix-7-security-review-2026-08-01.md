# Fix log entry — 2026-08-01 22:30

## Prompt

Backend fix #7 (security review 2026-08-01): the socket flood-protection middleware in [SocketHandler.js:48-62](server/socket/SocketHandler.js#L48-L62) dropped events over `MAX_EVENTS_PER_SECOND` but replied with a `room:error` for *every single dropped event*, and never disconnected repeat offenders — measured at a 2.48x bytes-back-vs-sent amplification with the socket still connected after 2000 flood events.

## Action

In [SocketHandler.js](server/socket/SocketHandler.js), the middleware now tracks `warnedThisWindow` (emits `room:error` at most once per 1s window instead of once per dropped event) and `violationStreak` (increments once per 1s window where the count exceeded the limit, resets to 0 on any clean window). When `violationStreak` reaches the new `config.FLOOD_DISCONNECT_STREAK` (added to [config.js](server/config.js), value `5`), the socket is force-disconnected via `socket.disconnect(true)`.

## Decision

Made the disconnect threshold a named config constant rather than inlining `5`, per this repo's own "Never use magic numbers elsewhere" convention already stated in `config.js`'s header comment. Chose "N consecutive over-limit windows" over "N total violations ever" so a socket that floods once, then behaves normally, isn't punished later — matches the review's ask ("đếm vi phạm, disconnect khi tái phạm") as *repeat* offense, not cumulative history.

## Summary output

`npm test`: 144/145 passing, same baseline (no test exercises the middleware body directly, per `SocketHandler.test.js`'s own `jest.mock('../config', ...)`). Wrote and ran (then discarded) a temporary Jest test reproducing the amplification/streak scenario directly against the real middleware (extracted via the `io.use()` callback SocketHandler registers): flooding one window emits exactly 1 `room:error` (not one per dropped event); 3 consecutive flooded windows (with `FLOOD_DISCONNECT_STREAK` mocked to 3) trigger `socket.disconnect(true)`; a clean window in between resets the streak so 2 non-consecutive flooded windows do not disconnect. All assertions passed.
