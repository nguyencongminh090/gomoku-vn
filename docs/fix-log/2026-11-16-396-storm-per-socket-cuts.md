# 2026-11-16 08:42 — #396 storm: cut two per-socket app costs (lazy require, O(N²) grace scan)
**Prompt:** "do #396". Branch `fix/396-storm-poll-burst` off `dev` (#388/#394 exist only there).
**Root cause — re-profile after #394** (cpu-prof 200 µs, storm window 1.5 s, vs a calm 1.5 s): connect handler 138 ms incl.
(cancelDisconnectGrace 100: emits 40 + room broadcasts 31 + whole-map scan 9), disconnect handler 83 ms,
`require()` ~40 ms incl. (`findParentPackageJSON` 23 self — a cached relative require still re-resolves the
path: `state.js` broadcastOnlineUsers/broadcastLobbyUpdate → `./home-feed`, `SocketHandler` disconnect →
`managers/ChatHandler`), `writevGeneric` 225 self (+117 vs calm), ws close-path `NodeError` 23.
**Fix:**
- `state.js`: memoized `_homeFeed()` getter (home-feed requires state.js, so not top-level).
- `SocketHandler.js`: `managers/ChatHandler` required at top (no cycle; no test uses doMock/resetModules on it).
- `DisconnectHandler.cancelDisconnectGrace`: "other player still in grace" checks this room's
  `gameState.players` instead of copying + scanning every grace entry (1 000 × 1 000 in the storm). Same result
  for any entry created by `startDisconnectGrace` (players of this game only).
**Test:** `DisconnectHandler.test.js` "#396 other rooms' grace entries are neither scanned nor counted" (1 000
foreign entries, reconnect resumes, `values/entries/forEach` never called) — failed before. Require hoist has no
behaviour to test; evidence is the profile. `npm test` 4046/4046.
**Measured** (`mixed.sh`, 2 500 rooms, 500 watchers, 1k storm; before = worktree `ae1f8db`, runs interleaved):

| run | ack p99 | p99.9 | max | storm GAPs (ms) | CPU |
|---|---|---|---|---|---|
| before1* | 244 | 302 | 310 | 126+169+159 | 40 % |
| before2 | 10.3 | 110 | 155 | 116 | 33 % |
| after1 | 23.2 | 232 | 274 | 449 | 41 % |
| after2 | 9.2 | 179 | 233 | 178+203 | 37 % |

\* before1: machine busy in warm-up (GAP cpu ≫ wall at 10–15 s). Storm-second ELD/ack tail is inside run noise —
**no latency win claimed.** Profiled after-run, same window: connect handler 138 → 102 ms, disconnect ~83 → ~50,
`require`/`findParentPackageJSON`/`:449` frames gone (~70 ms CPU less per storm).
**Remaining (not app per-socket work):** ws writes (`writevGeneric` ~237), socket.io encode, close-path errors,
and the 4 protocol emits per reconnect (timer:sync, game:resumed, game:init, room:updated) + 2 per drop.
Further cuts = merge emits (protocol change) or accept → owner call, #396 left OPEN.
