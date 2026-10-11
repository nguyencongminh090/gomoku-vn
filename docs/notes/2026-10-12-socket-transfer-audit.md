# 2026-10-12 — Socket/HTTP transfer audit (B226)
**Related:** #226, #225, #227 · harness `scripts/measure-socket-transfer.js` · code at `feature/225-home-live-push` (75b99b1)

## Method
Throwaway server copy (scratchpad rsync, own fresh DB, :3150, `AUTH_LIMITER_MAX`/`MAX_ROOMS_PER_IP` raised).
N guest sockets act as index.html tabs (`lobby:subscribe` + `home:subscribe`); 2 players, S spectators, 30 moves,
10 chat lines, resign, 10-socket churn, 10 s idle. Bytes = raw engine.io frames received, summed over recipients.
Runs: N=50/S=10 and N=200/S=20. HTTP polls: curl against the same copy (empty DB → bodies are minimums).

## Inventory (server → client; events with audience > 1 or recurring)
| Event | Emitter | Audience | Trigger | Shape | Size (measured) |
|---|---|---|---|---|---|
| `lobby:online_users` | state.js `broadcastOnlineUsers` (1.5 s debounce) + LobbyHandler on subscribe | every `lobby` socket | any socket connect/disconnect, anywhere | **full list** | ~70 B/user → 3.6 KB @50, 14 KB @200 |
| `lobby:update` | `sendLobbySnapshot` | one socket | subscribe | full room list | ~300 B/room |
| `lobby:patch` | `broadcastLobbyUpdate` (300 ms, diffed) | every `lobby` socket | room state change | delta | 311 B/room changed |
| `home:stats` / `home:live` | home-feed.js (#225, diffed) | `home` room | online/playing/room change | full (small) | 57 B / 18 + ~205 B/live game |
| `game:moved` | GameHandler | room (players+spectators) | move | delta + `timer` + `timerSync` | 246 B |
| `game:init` | GameHandler | room | game start | full board matrix | 1.2 KB (15×15) |
| `room:joined` | Lobby/Room/Match handlers | one socket | join | full room (+gameState) | 0.6–4.8 KB |
| `room:updated` | `_emitRoomUpdate` (debounced, user delta) | room | sit/ready/join/leave | delta | 0.3–3.1 KB |
| `chat:message` | ChatHandler + system lines | room | chat, every join | one line | 131–181 B |
| `timer:sync`, `game:ended`, offers | GameHandler | room | rare | small | 130–220 B |
| `tournament:list`/`_patch`, `tournament:updated`/`pairings_patch` | TournamentHandler | list room / tournament room | changes | snapshot then delta | not measured |
| `live_matches:list` | TournamentMatchHandler (setImmediate, diffed) | live-matches room | match change | full list | not measured (no tournaments) |
| `tmatch:*` | TournamentMatchHandler | match room | moves etc. | mirrors `game:*` | not measured |
| `private_message:receive`, `user:status`, `notify:new`, `session:*` | per-socket | one user | event | small | — |

HTTP polls (per open tab, only while visible): `/api/home` 60 s (fallback; push is primary), bell `/api/notifications` 60 s,
social page `/api/dm` + open thread 5 s, `/api/challenges` 10 s, club chat 8 s (chat tab only).
Bodies 20–130 B at empty DB, but every response carries **~1.1 KB of headers** (helmet CSP on JSON).

## Measured (N=200 lobby tabs, 20 spectators)
| Phase | Total | Top event |
|---|---|---|
| 200 tabs connect | 4.21 MB | `lobby:online_users` 4.16 MB (99 %) |
| 2 players connect + set up room | 3.04 MB | `lobby:online_users` 2.79 MB (one flush), `lobby:patch` 187 KB |
| 20 spectators connect + join | 3.33 MB | `lobby:online_users` 3.07 MB, `room:updated`+`room:joined` 138 KB, join chat lines 45 KB |
| 30 moves | 163 KB | `game:moved` 246 B × 22 recipients |
| 10 chat lines | 15 KB | — |
| game end | 93 KB | `lobby:patch` 62 KB |
| 10 tabs churn | 6.18 MB | `lobby:online_users` 6.14 MB |
| 10 s idle | 0 | no heartbeat traffic beyond engine ping |
Scaling: one online-list flush = 180 KB @N=50 → 2.79 MB @N=200 (4× users, 15.4× bytes) — **O(n²) confirmed**.
Under steady churn it flushes every 1.5 s → @500 users ≈ 35 KB × 500 = 17.5 MB per flush (extrapolated).

## Ranked findings (cost × frequency)
1. **F1 `lobby:online_users` full list to every lobby socket** — ~95 % of all bytes measured. Every connect/disconnect
   on *any* page (players, spectators, room tabs) triggers it; each new subscriber also gets it twice (subscribe reply +
   the debounced flush its own connect caused). Consumers: rooms-screen online line (count + first few names) and the
   PrivateChat online modal / partner-online check. Fix: (a) send `{joined, left}` deltas after one snapshot, (b) only
   sockets that show the list subscribe (rooms screen / modal open); dashboard already has the count via `home:stats`.
   Risk: medium — PrivateChat's `isOnline` relies on the list; reconnect must re-snapshot (see F3).
2. **F2 index.html subscribes to `lobby` on every screen** (`lobby.js:105`, unconditional). Dashboard/tournaments
   screens receive `lobby:patch` (311 B × all tabs per room change; 187 KB per game setup @200) and F1's list.
   Fix: subscribe/unsubscribe with the rooms screen, like lobby-home's `setSubscribed` for `home`. Risk: low.
3. **F3 lobby/tournament subscriptions are not renewed after reconnect** (code-read; not reproduced live).
   `lobby:subscribe`, `tournament:subscribe`, `live_matches:subscribe` are emitted once at load; a reconnect is a new
   server socket in no rooms, so the room list/online line/tournament list freeze until reload. lobby-home already
   re-subscribes `home` on `connect`. This is a correctness bug, not cost. Risk: low.
4. **F4 join system chat line per spectator** — O(S²) per join burst (45 KB for 20; ≤ ~145 KB at the 40-user cap).
   Fix: coalesce joins in the existing room debounce or drop the line for spectators. Risk: low (UX choice).
5. **F5 HTTP polls carry ~1.1 KB headers for 20–130 B bodies**; social page = DM 5 s + thread 5 s + challenges 10 s
   ≈ 0.55 KB/s per open tab. Fix: push DM/challenge changes through the per-user emitter NotificationService already
   uses (`notify:new`), keep a slow fallback poll; optionally drop CSP headers on `/api` JSON. Risk: medium.
6. **F6 `game:moved` sends `timer` and `timerSync`** (`timer` duplicates `timerSync.black/white`, ~30 B of 246).
   Small; touches the room clock → needs the diagnostic-page-sync rule. Not worth it alone.
7. **F7 `game:init` ships a full zero board matrix** (~480 B of 1.2 KB, once per game). Negligible.
Already fine: `room:updated` (user delta + debounce: one flush for 20 joins), `lobby:patch`/`home:*`/`live_matches:list`
diffed before emit, no idle traffic.

## Not measured
Tournament events (no tournament in the run), `tmatch:*`, real network/proxy overhead (WS `perMessageDeflate` is off by decision, index.js:94 — bytes above are wire bytes),
server CPU of the flushes, HTTP bodies with real data.
