---
name: realtime-reliability-resync
description: Rules for socket connect/reconnect, grace periods, game:move ack+retry, watchdog resync, optimistic render, viewer presence and why connectionStateRecovery was rejected.
domain: gomoku-vn
tags: socket-io,reconnect,grace-period,ack-retry,watchdog,resync,presence
apply_when: "Before changing socket-client.js, DisconnectHandler.js, game:move handling, room:joined/game:resync payloads, viewer/presence code, or considering socket.io connectionStateRecovery"
sources: "2026-08-02-todo-14-socket-client-js-bound-reconnect-attempt, 2026-08-04-todo-md-39-bao-cao-nguoi-dung-reconnect, 2026-08-14-todo-115-viewer-reconnect-unlimited, 2026-08-19-todo-131-socket-io-connect-timeout, 2026-08-19-todo-131-retune-timeout-12s, 2026-08-22-todo-145-socket-mo-som-trong-head, 2026-08-22-todo-146-touchsession-do-dong, 2026-08-22-todo-147-connectionstaterecovery-dieu-tra-dong, 2026-08-23-todo-149-dong-tripwire, 2026-08-24-todo-152-game-move-ack-retry-resync, 2026-08-24-todo-153-optimistic-render, 2026-08-26-todo-154-turn-watchdog-resync, 2026-08-27-todo-157-viewer-list-presence-dot, 2026-08-27-todo-158-lobby-usercount-ghost-viewers; TODO #14/#39/#115/#131/#145/#147/#149/#152/#153/#154/#157/#158"
last_reviewed: 2026-10-09
confidence: medium
---
# Realtime reliability and resync

## Why this note exists
Flaky links (lossy ISP, China/VPN) produced silent stuck states: lost moves, stale turns, ghost viewers. Each fix was a layer on a full-state `room:joined` rebuild; picking a heavier mechanism (`connectionStateRecovery`) was investigated and rejected after reading `node_modules`.

## Facts and rules
1. Reconnect listeners belong on the Manager: `this.socket.io.on('reconnect_attempt', ...)`, not on the Socket (#14: socket-level listeners never fired, banner stuck).
2. Connect `timeout` in `socket-client.js` is `12000` (was default 20000, then 8000). It was set from a measured distribution (WS handshakes 1.9-7.9 s on a 16.7%-loss path); retune only from measurements and keep it above `reconnectionDelayMax` and under 20000.
3. Do not touch transport order (`websocket` first, `tryAllTransports`), `reconnection*` options or `withCredentials` when tuning timeouts; tests in `socket-client-connect-options.test.js` pin them.
4. `index.html` opens the socket early via `js/socket-early.js` in `<head>` (#145): module scripts defer, so `io()` otherwise ran ~220 ms after HTML arrived. Scope was `index.html` only; WHATWG `preconnect` for `wss://` was closed not-planned.
5. Grace periods (`server/config.js`): `DISCONNECT_GRACE_MS` 60 s (player in an ongoing game), `EMPTY_ROOM_GRACE_MS` 20 s (sole occupant), `SPECTATOR_GRACE_MS` 30 s (seated player when game not ongoing). Maps are separate on purpose (`spectatorGraceTimers` in `state.js`).
6. Real viewers (`slot === null`) get no timeout: disconnect sets `presence = 'disconnected'` and broadcasts; `RoomManager.joinRoom()` treats "still in `room.users`" as a valid reconnect (#115, settled decision; do not reopen as cleanup).
7. Show viewer disconnect via `renderStatusDot(g)` in `renderUsersList()`; no dot means normal (#157). Lobby `userCount` in `RoomManager.listRooms()` excludes only `slot === null && presence === 'disconnected'`; seated players in grace still count (#158).
8. `game:move` is an ack call: client `sendMove` uses `emitAck` (5000 ms timeout), same `moveId` on one retry, then `game:resync` plus a message. Ack `{error}` is final, no retry. Server dedupes via `room._moveAcks` (cleared in `handleGameEnd`), re-sends `game:moved` only to the retrying socket, broadcast is emitted BEFORE the ack.
9. `game:resync` replies with `buildRoomStatePayload(room)` (`state.js`), the same builder as `room:joined`. One state builder only.
10. Gap check in `game:moved`: `moveCount === prev+1` apply; `<= prev` ignore; `> prev+1` `requestResync()` without applying. Full-state events reset the baseline (prevents infinite resync).
11. Optimistic render is a visual overlay `boardRenderer.setOptimisticStone()`, never written to `gameState.board`; ack error clears it.
12. Turn watchdog (`armTurnWatchdog`, armed in `applyTimerSync`) fires at a FRACTION (0.75) of the tracked clock, capped by `WAIT_CEILING_MS`, floor `WATCHDOG_FLOOR_MS` with doubling backoff. Arm only when it is not my turn. Fire past the deadline loses the race to your own timeout. Silent to the user. Move-confirm watchdog `MOVE_CONFIRM_TIMEOUT_MS` covers a lost `game:moved` after an ok ack.
13. `connectionStateRecovery`: closed, not built (#147). With default `skipMiddlewares: true` a recovered socket skips `io.use()`, so `socket.user` is undefined and revoked sessions revive. Benefit ~0 because the `existingRoom` path already resends full state. Chat gap tracked separately (#150, not done).
14. Tripwire (#149): `touchSession` blocks ~5 s then `SQLITE_BUSY` if a second DB connection ever holds a write lock. Only one `new Database(` exists in `server/db/database.js`; reread before adding worker threads.

## Symptom -> real cause -> fix
| Symptom | Real cause | Fix |
|---|---|---|
| Banner stuck on "lost connection" | listeners on wrong object | Manager listener (#14) |
| Game stuck, opponent moved | lost `game:moved` / stale state | gap check, watchdogs, `game:resync` |
| Watchdog fixed constant fires in 75% of games | median think time ~5 s, p99 ~50 s | fraction of tracked clock |
| Room card count too high | ghost viewers in `room.users.size` | filter in `listRooms()` |

## Verify before calling it fixed
- `npm test`; Playwright with `context.setOffline(true)` (see `playwright-e2e-safety`), asserting banner and recovery.
- Watchdog change: measure silence distribution from a READ-ONLY copy of the DB, not the live one.
- Test with opponent moving instantly: a watchdog must fire before the stuck player's own timeout.

## Do not use when
Pure clock display (see `server-client-clock-sync.md`) or broadcast volume (`broadcast-fanout-perf.md`).

## Related
- `be-realtime.md`, `server-client-clock-sync.md`, `broadcast-fanout-perf.md`
- TODO #14/#39/#115/#131/#145/#147/#149/#152/#153/#154/#157/#158; #150 open
