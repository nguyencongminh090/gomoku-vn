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
Perf (scope 3, 2026-11-15 23:50, `tools/perf/mixed.sh`, 2 500 rooms + 500 watchers + 1 000-socket storm, sim DB copy,
port 3117, `nice -n 19` on the host that also serves play3cr — run on owner's OK):

| | before b5f2711 | after cf2e22b |
|---|---|---|
| lobby per watcher | 1.1 KB/s, 31 patches, max 4.7 KB | 2.1 KB/s, 63 patches, max 2.4 KB |
| move ack p50 / p99 / p999 | 0.2 / 6.1 / 116 ms | 0.2 / 5.6 / 199 ms |
| server CPU / RSS | 32 % / 703 MB | 32 % / 710 MB |
| ELD in window p99 max / max | 18.2 / 298 ms | 13.2 / 184 ms |
| storm reconnect (5 shards) | 632–1 660 ms | 350–1 125 ms |

Patch rate doubles (0.5 → 1 /s), bytes ×1.9, largest patch halves; server cost unchanged. p999/storm/max differ
within run-to-run noise (single runs). Tool fixes the run needed: load.js `uniq` + pid (5 shards started in the same
ms → username clash, a shard died); mixed.sh waits for the port instead of `sleep 6`.
Client comments saying "2.5 s" (lobby.js:116/549, lobby-moves.js:7) left as is to avoid a cache-bust for comments only.
