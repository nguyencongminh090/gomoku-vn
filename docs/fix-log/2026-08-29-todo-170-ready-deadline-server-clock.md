# Fix log entry — 2026-08-29 13:57

## Prompt

> Do #B170

Followed by, when asked to choose between Plan A (server stamps `serverTime`) and
Plan B (accept + document the limitation): "Help me Choose best option" →
recommended Plan A → "Proceed".

## Action

`fix/ready-deadline-server-clock` off `dev` (tracking entry #170 exists only on
`dev`), merged back to `dev`.

**Bug.** `client/js/room-ui.js` `renderStartModal()` counted the ready window
down with `Math.ceil((deadline - Date.now()) / 1000)`, where `deadline`
(`st.roomData.readyDeadline`) is a **server-clock** epoch and `Date.now()` is the
client's wall clock. On a machine whose clock is skewed (measured `-8407.75 ms`
p50 on `wbcplayer`/CN via `/diag` #168, drift only `-37.4 ms/min` so it is real
system-clock skew, not measurement noise), the countdown was wrong by exactly
that skew — could show `0` with time left, or count from `~23` instead of `15`.

**Why the `instruction.md` quick-fix (just swap `Date.now()`→`serverNow()`) is a
no-op — verified real before coding.** `room-socket.js` only ever set
`clockOffsetMs` in `applyTimerSync`, which runs on `timer:sync` — and `timer:sync`
does not exist until a game is running. The ready-window countdown runs *before
the first game*, so `clockOffsetMs` is still `0` and `serverNow() === Date.now()`.
The server set `room.readyDeadline = Date.now() + READY_WINDOW_MS` and sent it in
the room payload **without any server-clock stamp** — the client had no server
time reference during the ready phase at all. This is exactly the "ship the
shell" failure the CLAUDE.md Root-cause rule warns about.

**Plan A (chosen by user).** Give the client a server-clock anchor during the
ready phase:

- `server/managers/RoomManager.js` `serializeRoom()` — add `serverTime: Date.now()`
  next to `readyDeadline`. Covers every `room:joined` path (LobbyHandler ×2 +
  `state.js buildRoomStatePayload` / `game:resync`).
- `server/socket/state.js` `_emitRoomUpdate()` — add `serverTime: Date.now()`
  stamped fresh at emit time (the payload is built field-by-field, not spread
  from `full`). Doc comment listing the always-included scalar fields updated.
- `client/js/room-socket.js` — new `syncClockFromServerTime(serverTime)` folds
  the stamp into `clockOffsetMs` via the **same** `TimerSyncCore.clockOffsetMs`
  formula `applyTimerSync` uses (so the two can't drift; a NaN/missing stamp is
  ignored, leaving the offset at its last value / `0`). Called from the
  `room:joined` and `room:updated` handlers. `serverNow` is now exported on
  `global.RoomSocket` **as a function** (not the offset value, which would be
  captured once at wiring time).
- `client/js/room-ui.js` — module-local `serverNow()` helper: uses
  `global.RoomSocket.serverNow()` when present, falls back to `Date.now()`
  otherwise (pre-fix behaviour, for the window before `room-socket.js` finishes
  loading). `renderStartModal()`'s `tick()` subtracts `serverNow()`.

**Not touched:** `timer-sync-core.js` (the `clockOffsetMs` semantics — pure skew
+ transit deliberately folded, per its header and the room watchdog — are
unchanged; I only added another caller of the existing function).
`tournament-detail.js` (rounds to whole hours, 8s changes nothing),
`tournament-match.js` (user's standing "do not touch tournament" decision).
`game-ui.js` / `chat-ui.js` / `session.js` call sites — re-reviewed, all
local−local or hour-granularity, not bugs.

Diagnostic-page-sync rule re-checked: no change to tick interval, rendered
granularity, `game:move` ack measurement, or `/diag`'s `TimerManager` mode; the
`/diag` probe computes its own offset with the same core function, so page and
room still describe the same clock.

`?v=170 → 171` across `client/` (grep: exactly one value; mockups still pinned
at `?v=61`).

## Decision

- Plan A over Plan B: only A fixes the measured `-8.4 s` case, which happens *on
  the ready screen* — Plan B's call-site-only fix would not take effect until the
  first `timer:sync`, by which point the ready countdown is gone.
- Feed `clockOffsetMs` from `room:joined`/`room:updated` unconditionally (not
  gated to the ready phase): the variable's documented meaning is already
  "serverTime − our Date.now() at the last sync", the formula is identical, and
  in-game `timer:sync` fires every move so there is no contention. Bonus: keeps
  `serverNow()` accurate between games too.
- Stamp `serverTime` on every room payload, not only when `readyDeadline` is
  non-null — it is one scalar, the O(n²) concern in `_emitRoomUpdate` is about
  arrays, and an always-fresh anchor is simpler than conditional logic.

## Summary output

`fix/ready-deadline-server-clock` → `dev`. Server stamps `serverTime` next to
`readyDeadline` in `room:joined` + `room:updated`; `room-socket.js` folds it into
`clockOffsetMs` (same `TimerSyncCore` formula as `timer:sync`) and exports
`serverNow` as a function; `room-ui.js renderStartModal()` counts down against
`serverNow()` with a `Date.now()` fallback. Fixes the ready-window countdown
being wrong by the client's wall-clock skew (measured −8.4 s on one CN player).
`timer-sync-core.js` / tournament code untouched. `?v=170→171`. Tests: +6
`client/tests/room-socket-server-clock-ready-phase.test.js`, +8
`client/tests/room-start-modal-countdown-server-clock.test.js`, +1
`RoomManager.test.js`, +1 `room-update-delta.test.js`. `npm test` **1860/1860**.
