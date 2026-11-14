# 2026-11-14 — #377 lobby:patch resent whole room entries every 2.5 s
## Prompt
"Do #377" (docs/todo/B377-lobby-patch-moves-delta.md).
## Root cause
`_diffLobbyRooms` compared each listRooms() entry as one JSON string, so any new move re-sent the room's
whole entry: full `moves` AND ~490 B of unchanged names/avatars/ratings/settings. Measured: moves-only
delta (Scope 1) cut 110 → 98 KB/s; the static part was most of the patch → Scope 2 applied too.
## Fix
- `client/js/lobby-moves.js` (UMD, shared by server + lobby): `sharedPrefix` (common prefix, whole moves;
  undo shrinks history so not `prev.length`), `applyDelta` (splice by index onto the held entry, merge
  held fields; null when held is missing / another game / shorter than `movesFrom`).
- `state.js`: baseline per room = JSON of entry-without-moves + moves array. Same game, only moves changed
  → upsert `{ roomId, startedAt, movesFrom, moves }`; static change too → full entry + moves delta; new
  room / new game / no prefix → full entry as before. Snapshot (`lobby:update`) shape unchanged.
- `lobby.js` `applyLobbyPatch`: applies `LobbyMoves.applyDelta`; a delta that does not fit is skipped
  and one `lobby:subscribe` sent (flag reset on `lobby:update`). `index.html` loads lobby-moves.js.
## Verification
Tests: `server/tests/lobby-moves.test.js` (prefix table incl. undo/odd index; splice/merge/idempotent/
null cases), `lobby-delta.test.js` (board-only shape, static+delta, full on start/rematch/end, snapshot +
patches incl. a mid-stream newer snapshot ≡ server state), `client/tests/lobby-moves-delta.test.js`.
`npm test` 3855 green.
Load (load.js, 500 rooms, 500 moves/s, 50 lobby watchers, 30 s, dev vs branch): per watcher
109.9 → 15.7 KB/s, max patch 305.5 → 39.4 KB; ack p99/CPU unchanged.
Browser (Chromium, real server, own DB): joined mid-game 6 → 12 stones on the card, card SVG identical to
a fresh page's snapshot; rematch 2 → 5 stones identical; patch frames carried `movesFrom`; 0 console errors.
Not verified: phones/Safari. Edge left: a mismatch arriving right after the rooms screen unsubscribed
re-subscribes the lobby (needs a delta mismatch in that window; harmless traffic only).
