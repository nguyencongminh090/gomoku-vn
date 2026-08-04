# Fix log entry — 2026-08-04 09:00

## Prompt

TODO.md Phần B #33 (from the 2026-08-03 security-review recheck): `acceptDraw()`/`declineDraw()` in [server/managers/GameEngine.js](server/managers/GameEngine.js) checked `this.drawOffer.from !== userId` (blocking only self-accept/self-decline) but never checked whether `userId` was actually one of `this.players` — unlike the adjacent `resign()`/`offerDraw()`, which already have that check. A spectator (any user in `room.users` without a seat, per `RoomManager.joinRoom()`) could call either function directly through the existing `game:draw_accept`/`game:draw_decline` socket handlers.

## Action

Copied the existing `const player = this.players.find(p => p.userId === userId); if (!player) return { error: 'Bạn không phải người chơi.' };` pattern from `resign()`/`offerDraw()` into the top of both `acceptDraw(userId)` and `declineDraw(userId)`, before the existing `drawOffer` checks.

## Decision

Followed `instruction.md` §B33 exactly: fix placed in `GameEngine` (the source of truth for game state), not in the socket handler (`GameHandler.js`), so any future call path into `acceptDraw`/`declineDraw` is covered too, not just the current socket route. Reused the exact error string already used by `resign`/`offerDraw` rather than inventing new copy. Scoped strictly to what §B33 described — did not touch `game:draw_accept`/`game:draw_decline` in `GameHandler.js` (left as Phần B #34 does something analogous but different, at the handler layer, for time requests).

## Summary output

`npm test`: 361/361 passing (was 359). Added 2 cases to the existing `GameEngine — Draw offer` describe block in [server/tests/GameEngine.test.js](server/tests/GameEngine.test.js): a non-player ("spectator-1", not in `players`) calling `acceptDraw`/`declineDraw` while a real offer is pending is rejected with `'Bạn không phải người chơi.'`, and the game/`drawOffer` state is left unchanged. Mutation-checked: reverted just [server/managers/GameEngine.js](server/managers/GameEngine.js) (test file unchanged) — both new cases failed exactly as expected; restored the fix, both green again.
