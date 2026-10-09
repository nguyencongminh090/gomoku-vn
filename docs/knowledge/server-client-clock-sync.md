---
name: server-client-clock-sync
description: How the room's client clock is anchored to the server clock (offset, half-RTT EMA, display-only transit shave, jitter damping, ready-deadline) and which values may never decide a timeout.
domain: gomoku-vn
tags: timer,clock-sync,latency,jitter,serverNow,ready-deadline
apply_when: "Before touching timer display, timer:sync, clockOffsetMs/serverNow(), halfRttMs, readyDeadline countdowns, or any client code comparing a server epoch to Date.now()"
sources: "2026-08-04 TODO #37 (Swap2 timer), 2026-08-08-todo-76-tournament-ready-auto-enter, 2026-08-28-todo-165-timer-transit-delay-compensation, 2026-08-28-todo-166-timer-delay-mobile-players-strip, 2026-08-28-todo-168-diagnostic-latency-page, 2026-08-28-todo-169-timer-clock-display-jitter, 2026-08-29-todo-170-ready-deadline-server-clock; TODO #37/#76/#165/#166/#168/#169/#170"
last_reviewed: 2026-10-09
confidence: high
---
# Server vs client clock sync

## Why this note exists
The displayed clock was wrong in three different ways on three different layers: constant "extra d seconds" (#165, packet transit), 1 s stutter on jittery links (#169, rounding flip), and a ready countdown off by the client's wall-clock skew (#170, no server anchor existed yet). Each looked like "timer display bug".

## Facts and rules
1. The server (`TimerManager`) is the sole clock authority. Nothing client-side may decide a timeout; client values are display compensation only.
2. `clockOffsetMs = serverTime - Date.now()`, computed by `TimerSyncCore.clockOffsetMs(serverTime, Date.now())` in `client/js/timer-sync-core.js`. Reuse that function for any new anchor; never hand-copy the formula (`timer-sync-conformance.test.js` guards the room files).
3. `serverNow() = Date.now() + clockOffsetMs` in `room-socket.js`. It is exported as a FUNCTION on `RoomSocket` (not the offset value, which would be captured once). Fallback to `Date.now()` if `RoomSocket` is absent (see `serverNow()` in `room-ui.js`).
4. `clockOffsetMs` keeps pure-skew semantics: transit delay is NOT folded in. `activeDeadline`, `serverNow()` and `armTurnWatchdog` therefore do not move with the display shave.
5. Half-RTT estimate `halfRttMs` comes from the `game:move` ack (`recordMoveRtt` in `game-ui.js`), EMA alpha 0.5 (`halfRttEma`). socket.io engine ping/pong is unusable (heartbeat is server-initiated). Measure on accepted or rejected acks; not on ack timeout; drop samples over 30 s (`RTT_SAMPLE_MAX_MS`).
6. Transit shave: `transitDelaySec` clamped at 8 s (`TRANSIT_CLAMP_MS`). Subtract it only from the displayed value of the running clock (in `tickLocal` and the opening value in `applyTimerSync`). A stopped/paused clock shows the exact server value, unshaved.
7. Whole-second shave uses `displayShaveSec(halfRttMs, prevShaveSec)` with hysteresis `SHAVE_HYSTERESIS_SEC = 0.25` (a quarter of the 1000 ms tick; provisional, derived from the tick not from one sample). The 1-arg form must stay equal to plain `Math.round(transitDelaySec())` for `/diag` parity.
8. `clampActiveDisplay` in `room-socket.js`: a running clock never jumps UP within a turn. Reset on turn change, unpause, or a deadline pushed out by more than `TIME_GRANTED_MARGIN_MS` (2000). Accepted tradeoff: after a real RTT spike the clock may hold 1-2 s.
9. Before `sendMove` snapshots timer values, call `RoomSocket.refreshLocalTimer()` (= `tickLocal`) so the snapshot is deadline-fresh.
10. On `visibilitychange` (visible) and window `focus`, `resyncClockOnReturn()` requests a resync (debounced 1 s, only while the game is ongoing). Never re-apply an old `lastSync`: its `serverTime` is stale.
11. Ready window: the server stamps `serverTime` in `serializeRoom()` and `_emitRoomUpdate()`; `room-socket.js` `syncClockFromServerTime()` folds it on `room:joined` / `room:updated`. `renderStartModal()` counts down against `serverNow()`. Before this, `timer:sync` did not exist until a game ran, so `serverNow()` was `Date.now()`.
12. Mobile strip and desktop bar share `GameUI.effectiveTimerValues()` / `effectiveTurnColor()`; fix timer display there, not per surface.
13. `tournament-match.js` keeps its own copy of `applyTimerSync`/`tickLocal` on purpose; fixes in room code are NOT automatically there. Port only on request.
14. Swap2 timer: `TimerManager.remapForSwap2()` re-maps placeholder colours without discarding spent time (#37).
15. Tournament match clock starts server-side when both players are ready; the client auto-enters (#76) so the later clicker is not charged.

## Symptom -> real cause -> fix
| Symptom | Real cause | Fix |
|---|---|---|
| Clock jumps 13s->10s per move on VPN | `timer:sync` transit `d` not in offset; display always `d` high | half-RTT shave on display only (#165) |
| Clock stutters 1 s on 3G | EMA straddles .5 rounding point | hysteresis + monotone clamp (#169) |
| Ready countdown shows 0 early / starts ~23 | `Date.now()` vs server epoch; no anchor pre-game | `serverTime` on room payloads (#170) |
| "Just swap to serverNow()" did nothing | offset only set by `timer:sync` | stamp the payload first |

## Verify before calling it fixed
- `grep -rn "?v=" client/*.html client/js/ | grep -v mockup | grep -o "?v=[0-9]*" | sort -u` shows one value.
- Run `npm test`; the conformance and `timer-sync-core` suites must stay green.
- Inject a noisy `halfRttMs` series and assert the displayed sequence, not "no throw".
- Test with a client clock skewed several seconds (the #170 case was about -8.4 s).
- Real latency cannot be forced via CDP (Chromium limit); use `/diag` samples, or `localStorage.gvn_timer_debug = '1'` logs.

## Do not use when
Server timeout logic, lobby/tournament scheduling in whole hours, or non-clock reconnect issues.

## Related
- `.claude/rules/diagnostic-page-sync.md` (diag/room coupling; do not duplicate)
- `realtime-reliability-resync.md`, `broadcast-fanout-perf.md`
- TODO #167 (server-side lag refund, not done as of the sources)
