# 2026-11-16 09:23 — #398 Merge disconnect-grace emits (clock rides on game:interrupted / game:resumed)
## Prompt
"do #398". Branch `fix/398-merge-grace-emits` off `dev` (#396 exists only there).
## Root cause
Per drop: `timer:sync` + `game:interrupted` to the room. Per resume: `timer:sync` + `game:resumed` to the whole room
(self included) + `game:init` to self, which already carried `timerSync`. ~4 redundant packets per storm pair (#396 profile).
## Fix
- `DisconnectHandler.startDisconnectGrace`: no separate `timer:sync`; `game:interrupted` carries `timerSync` (paused clock).
- `cancelDisconnectGrace`: `socket.to(room)` `game:resumed { playerId, timerSync }` (others only); self gets `game:init` alone
  (its handler already sets status 'ongoing' from serialize and `applyTimerSync` re-arms the watchdog). `otherStillAway` branch unchanged.
- `room-socket.js`: `game:interrupted` → `applyTimerSync(data.timerSync)` before the watchdog cancel; `game:resumed` applies its sync.
- Step 3 decision: **no compat `timer:sync` kept** — rooms are in-memory only (`RoomManager.rooms` Map, no restore), a deploy
  restart ends every game, so no pre-#398 tab can be mid-game on the new server. Clock maths / `timer-sync-core.js` untouched.
- Side effect: the reconnecting player no longer reads "Đối thủ đã kết nối lại!" about themselves (#387 self case); #387's viewer case stays open.
- `?v=` bumped by cache-bust (room-socket.js → room-entry.js, room.html).
## Verification
- `DisconnectHandler.test.js` "#398 drop and resume each send one game event per side" (drop = [game:interrupted]+sync; resume =
  nothing to io.to(room), [game:resumed]+sync via socket.to, self [game:init] same sync). `turn-watchdog-resync.test.js` 3 new
  (#398 block): interrupted freezes clock, resumed applies + re-arms, self game:init alone → ongoing + watchdog; first two fail on old client.
  `npm test` 231 suites / 4050 pass.
- Real browser (isolated server :3101, own DB, two guest tabs seated, B's engine closed with 5 s reconnect delay): A interrupted,
  clock frozen 297/300 over 2 s; after resume both tabs 294→292, A events [game:interrupted, game:resumed], B [game:init]; no page errors.
- `mixed.sh` (2 500 rooms, 500 watchers, 1k storm; before = worktree 384f946, interleaved):

| run | ack p99 | p99.9 | max | storm ELD max | CPU |
|---|---|---|---|---|---|
| before1 | 19.6 | 182 | 229 | 205 | 45 % |
| after1 | 11.8 | 155 | 196 | 196 | 35 % |
| before2 | 5.5 | 125 | 161 | 148 | 33 % |
| after2 | 5.5 | 95 | 137 | 88 | 32 % |

  Profiled pair (storm ±1 s): `startDisconnectGrace` incl. 45→30 ms, `handleDisconnect` 49→33, `writevGeneric` incl. 376→269,
  socket.io `flush` 448→309; `cancelDisconnectGrace` ~104 both (serialize for game:init + room:updated dominate). Latency
  differences are inside run noise — the claim is the profile delta only. Not verified: real phones / production proxy.
