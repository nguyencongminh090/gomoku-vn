# 2026-11-14 15:30 — untracked: lag during play (client per-move cost + server event-loop stalls)
## Prompt
User report "site is lag during play"; analyse perf + data transfer S→C→S and fix; scale 100–1000 players, ~5 s/move.
## Root cause
Measured, not guessed (`tools/perf/`: harness.js = real Chromium player vs socket bot, CPU 4×, 390 px; load.js + eld.js = 500 rooms / 1000 players at 1 move/s + 50 lobby watchers re-visiting every ~10 s).
1. Client, per `game:moved`: `renderMoves()` rebuilt both move lists from scratch (one inline piece SVG per move → O(n) per move), then read `scrollHeight` (forced sync layout); `renderGameControls()` rewrote identical tiles and scheduled `board.resize()` every move (forced re-layout + 2nd full board `_draw`, the #90 pattern). Late game: 56 ms/move, 22 long tasks in 160 moves.
2. Server: `avatarLookup` = `getUserById` (`SELECT *`, `db.prepare` on every call) once per online user in `getOnlineUsersList()`, which runs on every lobby/home subscribe, online flush, and home stats (which only needed `.length`). At ~1000 online one build blocked the event loop 60–300 ms → every game's move ack p90 77 ms / p99 150 ms / max 186 ms.
3. Wire: `game:moved` carried both `timer` and `timerSync` (same two clocks).
## Fix
- `game-ui.js`: move lists append one row when exactly one move was added (full rebuild otherwise: undo, resync, new game, look change); piece icon built once per render; scroll in rAF. `renderGameControls`/`setControlsHtml` rewrite + resize only when the markup changed (swap2/initBoard writers reset the cache).
- `server/managers/avatar-lookup.js`: prepared-once `SELECT avatar_v` (DB stays the source, no cache). `state.getOnlineUsersCount()` for home stats / `/api/home`.
- `GameHandler`: mid-game `game:moved` drops `timer` (client `applyTimerSync` rewrites both clocks); game-over moves keep it.
## Verification
Tests: `avatar-lookup.test.js`, `state-online-users` (count, no lookup), `home-feed` mock, `game-move-ack-resync` (no `timer`), `game-ui-actions` (incremental lists ≡ full render incl. undo 1/2, resync, new game; controls not rewritten/resized when unchanged). `npm test` 3824 green.
Browser (stone, 20×20, 160 moves, 4×): `game:moved` handler last 20 moves 56 → 11.6 ms, long tasks 22 → 0; paper 9 ms. Packet 277 → 241 B.
Load (500 rooms, 499 moves/s, 50 lobby watchers re-subscribing ~10 s, alive through the window): ack p99 150 → 8.2 ms, max 186 → 20 ms, server CPU 48 → 14 %, event-loop max 150–270 → 12–28 ms (one 95 ms spike).
Not verified: real phones / Safari; production network (RTT not measured here).
