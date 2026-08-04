# Fix log entry — 2026-08-01 22:30

## Prompt

Backend fix #4 (security review 2026-08-01): a player disconnecting mid-game could be scored a timeout loss while still inside their own 60s reconnect grace window — `cancelDisconnectGrace` in [DisconnectHandler.js:167-199](server/socket/handlers/DisconnectHandler.js#L167-L199) set `room.state = 'playing'` and called `timer.start()` for *any* reconnect, with no check for whether the other player (who may have also disconnected) was still within their own grace window. The measured repro: both players drop, the player whose turn it is NOT reconnects first, the game clock restarts on the still-absent player's turn, and they lose on time with 45s of their own grace still remaining.

## Action

Reworked `cancelDisconnectGrace` ([DisconnectHandler.js](server/socket/handlers/DisconnectHandler.js)): before flipping `room.state` to `'playing'` or calling `timer.start()`, it now checks whether any other entry in `disconnectTimers` still belongs to the same `roomId`. If so, the reconnecting socket is joined to the room and sent `game:init` (so they see the current board) plus a chat notice, but `room.state` stays `'interrupted'` and the timer is **not** restarted. The real resume (state → `'playing'`, `timer.start()`, `game:resumed` broadcast) only fires once the reconnect call finds nobody else from that room still in `disconnectTimers` — i.e. when the last absent player returns.

## Decision

Chose "delay resume until the room has nobody left in grace" over more granular per-player timer bookkeeping because `disconnectTimers` is already keyed per-`userId` with a `roomId` field, so checking for other live entries with the same `roomId` needed no new state — just a scan of the existing Map. The early-return path still calls `socket.join()` and emits `game:init` so the returning player isn't left staring at nothing while waiting on their opponent, addressing the same "silent hang" concern as fix #5/restart-hang without introducing a new client event (reuses `game:init` and the generic `chat:message` channel).

## Summary output

`npm test`: 144/145 passing, same baseline — the existing "reconnecting within the grace window cancels the timer and resumes the game" test in `DisconnectHandler.test.js` still passes because with only one player in grace, the new `otherStillAway` check is false and the full-resume path runs exactly as before. Wrote and ran (then discarded) a temporary Jest test reproducing the review's exact two-player scenario: both A and B disconnect, A reconnects first — asserted `room.state` stays `'interrupted'`, `timer.start()` is NOT called, and A still receives `game:init`; B then reconnects — asserted `room.state` becomes `'playing'`, `timer.start()` is called exactly once, and `disconnectTimers` is empty. All assertions passed.
