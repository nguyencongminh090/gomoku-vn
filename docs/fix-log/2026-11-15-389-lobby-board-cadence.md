# 2026-11-15 22:40 — #389 Rooms tab live boards: move → card ≤ 1 s, wherever the move falls in the window
## Prompt
"do #389" (from user 2026-11-15 "Room cập nhật đôi lúc bị trễ … có lúc nhanh/lúc chậm").
## Root cause
`scheduleLobbyBoardUpdate` (server/socket/state.js): one per-server timer opened by the first move after a flush,
fired 2.5 s later, and then went through `_scheduleLobbyFlush` — the 300 ms seat debounce — on top. A move that
opened the window reached the cards 2.8 s later, one made just before it closed 0.3 s later (uneven by design, #364).
## Fix
- `LOBBY_BOARD_THROTTLE_MS` 2 500 → 1 000.
- The board window now closes straight into `_flushLobbyNow` (new; the debounced flush calls it too). It clears a
  pending seat debounce, since its diff covers that change. So move → patch ∈ (0, 1 000] ms, was [300, 2 800].
- Still one patch per window, never per move (#364 Don't); dirty set (#380) and moves delta (#377) unchanged.
## Verification
`server/tests/lobby-delta.test.js` +6: a move 0/10/500/990 ms into an open window lands ≤ 1 s (4 failed before:
2 800 / 2 790 / 2 300 / 1 810 ms); a move during a pending seat flush ≤ 1 s; 100 moves over 10 s → ≤ 11 patches.
`npm test` 4 026 green (4 020 + 6).
Not done: scope 3 perf re-measure (`tools/perf/mixed.sh`) — this machine serves play3cr (port 3000 + cloudflared),
so per the Trap it was not run here. Expected: patch rate per watcher 0.4 → ≤ 1 /s, bytes up < 2.5× from the #386
1.1 KB/s (each patch carries fewer new moves, same per-room header). Client comments saying "2.5 s"
(lobby.js:116/549, lobby-moves.js:7) left as is to avoid a cache-bust for comments only.
