# 2026-11-16 05:29 — #388 room:updated flush: one shared, budgeted scheduler instead of a timer per room
## Prompt
"Do #388", then "okay, do 1 2 3" (fix harness race, 2 more after-runs, profile the storm-second tick).
## Root cause
`broadcastRoomUpdate` armed its own 80 ms `setTimeout` per room. The storm calls it for hundreds of rooms in one
tick (grace start, then rejoin), so their timers expire in ONE `listOnTimeout` pass that flushed every room
back-to-back: up to 44.5 ms of `_flushRoomUpdate` in one busy run (cpu-prof, 200 µs).
The storm-SECOND spike is a different cause: the server is ~97 % busy for ~1.5 s from the reconnect burst, and one
libuv poll phase runs 0.5 s of per-socket connect/disconnect callbacks (`GAP` probe: cpu ≈ wall, no major faults,
no Mark-Compact — real work, not the machine or GC). Short `(idle)` slices split it into many short busy runs.
→ #396 (per-socket cost; its largest app share is sync info logging → #394).
## Fix
`server/socket/state.js`: `_roomUpdateDue` (roomId → dueAt, insertion = due order) + one timer for the head;
`_drainRoomUpdates` flushes due rooms for ≤ 5 ms (`ROOM_UPDATE_FLUSH_BUDGET_MS`), then `setImmediate` so I/O runs
between chunks. 80 ms window, `settings`/`seenUserIds` merge and `clearRoomUpdateSnapshot` cancel unchanged.
Harness: `mixed.sh` `SRV_ARGS` (e.g. `--cpu-prof`), refuses a busy :3117 and waits for its server to exit (after1
hung 40 min: its curl hit the dying previous server, watchers got ECONNREFUSED); `prof.js` `from to` window;
`eld.js` logs `GAP` (wall/cpu/ctx switches/major faults) on any > 100 ms timer gap.
## Verification
Tests: `room-update-delta.test.js` +1 regression (40-room burst: another callback runs between flushes, all 40
sent; failed before), "one timer each" → one shared timer. `npm test` 4041/4041.
cpu-prof storm window: `_flushRoomUpdate` max in one busy run 44.5 → 20.0 ms (total 127 → 99 ms).
`mixed.sh` (2 500 rooms, 500 watchers, 1 000-socket storm), unprofiled runs only, same machine (another dev server
was running, pid not ours):

| run | ack p99 | ack p99.9 | storm-second ELD max | next seconds ELD max | CPU |
|---|---|---|---|---|---|
| before (dev) | 65.2 | 222 | 93.6 | 72.5 / 93.7 | 48 % |
| before2 (dev) | 29.2 | 281 | 360.7 | 33.2 / 36.1 | 45 % |
| after2 | 15.1 | 157 | 162.9 | 48.0 / 24.7 | 41 % |
| after3 | 19.4 | 285 | 264.6 | 37.7 / 13.8 | 39 % |
| after4 | 13.8 | 162 | 162.9 | 31.3 / 13.0 | 36 % |
| after5 | 22.1 | 281 | 263.3 | 31.9 | 39 % |

Held: ack p99 lower (29–65 → 14–22 ms), calmer seconds after the storm, ~7 pts less CPU. NOT improved within the
noise: storm-second ELD max (94–361 → 163–265 ms) and ack p99.9 (222–281 → 157–285 ms) — that is #396.
