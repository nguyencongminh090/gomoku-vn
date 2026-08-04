# Fix log entry — 2026-08-01 22:30

## Prompt

Backend fix #2 (security review 2026-08-01): games involving a guest player were not being saved at all — `isGuest: false` was hardcoded for every player in [server/socket/handlers/GameHandler.js:662](server/socket/handlers/GameHandler.js#L662), so `database.js`'s guard against writing guest ids into `black_player_id`/`white_player_id` never triggered and the FK constraint added by migration `002_rebuild_player_games_and_games_fk.sql` silently rolled back the whole `saveGame` transaction — losing the game record for the registered opponent too.

## Action

`room.users` already tracked a real `isGuest` flag per user ([RoomManager.js:102,153](server/managers/RoomManager.js#L102)), it just never reached `engine.players`. Threaded it through: both `new GameEngine(...)` call sites in `startGame()` ([GameHandler.js](server/socket/handlers/GameHandler.js), Swap2 branch and normal branch) now pass `isGuest: blackPlayer.isGuest` / `isGuest: whitePlayer.isGuest` from the `room.users` entries already in scope. `handleGameEnd`'s `saveGame` call ([GameHandler.js:662](server/socket/handlers/GameHandler.js#L662)) now reads `p.isGuest` instead of the `false` literal.

## Decision

Used the real per-user flag already present on `room.users`, not the `guest_` userId-prefix heuristic the initial fix draft considered — `GameEngine.serialize()` explicitly whitelists fields it returns to clients ([GameEngine.js:490](server/managers/GameEngine.js#L490): only `userId`/`displayName`/`color`), so adding `isGuest` to `this.players` does not leak it to the client.

## Summary output

`npm test`: 144/145 passing, same baseline as fix #1 (no regression). Manual DB control test against real `server/db/schema.sql` with foreign_keys=ON: built a guest-vs-registered game with `isGuest` correctly threaded and called the actual `INSERT` logic from `database.js`'s `saveGame` — `black_player_id` correctly nulled, row persisted successfully (`SAVED OK`), matching the review's documented "control: FK off" behavior but now achieved with FK left ON.
