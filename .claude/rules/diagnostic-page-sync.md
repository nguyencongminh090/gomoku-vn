---
paths:
  - "server/managers/TimerManager.js"
  - "server/socket/diag-session.js"
  - "server/socket/diag-namespace.js"
  - "client/js/room-socket.js"
  - "client/js/game-ui.js"
  - "client/js/timer-sync-core.js"
  - "client/js/diag/**"
  - "client/diagnostic.html"
---

# Diagnostic page ↔ room clock: keep them describing the same clock

The unlisted `/diag` page (TODO.md #168) exists to report the exact quantities the room's timer
*acts on*, so a high-latency reporter's numbers mean something to #167. That only holds while the
diagnostic path and the room path stay in step. Three couplings drift silently — no test fails, the
page still renders, and every submitted diagnostic quietly starts describing a clock nobody runs.

**When you change how the room's clock works** — `TimerManager` mode/tick/sync semantics,
`room-socket.js`'s `tickLocal`/`applyTimerSync`, or `game-ui.js`'s `recordMoveRtt` — re-verify all
three before calling the change done:

## (a) `timer-sync-core.js` still matches the room

`client/js/timer-sync-core.js` is a **verbatim extraction** of the room's clock maths (half-RTT EMA,
transit-delay display shave, clock offset) — `room-socket.js` and `game-ui.js` call into it rather
than keeping their own copy. If your change alters any of those expressions, the core must move with
it, or the room and the diagnostic page will compute different half-RTTs from the same packets.

`server/tests/timer-sync-conformance.test.js` guards the *structure* (both room files call the core;
no re-inlined copy of the 8s clamp / 30s ceiling / 50/50 blend). It does **not** guard that the
core's formula is still the one the room wants — that judgement is yours. `timer-sync-core.test.js`'s
"room-parity" block re-runs the pre-#168 expressions; update those expressions there too if you
deliberately change the maths, so the parity check tracks the new intent.

## (b) `diag-report.js` measurements still reflect the real path

`client/js/diag/diag-report.js` turns raw percentiles into verdicts, with thresholds **derived**
from two facts about the room (documented in that file's header):

- the room clock ticks every **1000 ms** and renders whole seconds — the `HALF_RTT_RED_MS` = 500
  boundary is half that tick;
- the affected players measured at **~500 ms round trip** (`game-ui.js`'s `MOVE_ACK_TIMEOUT_MS`
  comment, #152/#165) — the `HALF_RTT_YELLOW_MS` = 250 boundary.

If your change alters the tick interval, the rendered granularity, or what `game:move` acks measure,
those derivations no longer hold. Re-derive the thresholds from the new facts and update both the
constants and the header explaining them. Same for `diag-board.js`'s three timed quantities
(`inputPaintMs` / `moveConfirmMs` / `timerHandoffMs`) — they assume the optimistic-stone-then-emit
ordering from #153/#155; if that ordering changes in the room, it changes here.

## (c) `/diag` `TimerManager` mode is still the app default

`server/socket/diag-session.js` hard-codes `mode: 'per_game'` and `DIAG_TIMER_SECONDS` (300, not the
app's 60) — the choice is explained in that file's header. `per_game` was picked because it is the
app default (`config.DEFAULT_TIMER_MODE` at the time was `per_move`, but `per_game` is what a normal
ranked game uses and what the c→s→c handoff measurement needs). If the app's default timer mode
changes, decide deliberately whether `/diag` should follow — and if it should stay `per_game`,
update the header comment to say *why* it now diverges rather than leaving it looking stale.

## Not covered here

- `tournament-match.js`'s own clock copy — that is **B169** (stack, not part of #168; see
  `docs/todo/B169-*.md`). It does not yet call `timer-sync-core.js`.
- The `/diag` namespace's isolation guarantees (no auth middleware, own limiter, no room registry) —
  those are asserted in `server/tests/diag-namespace.test.js`, not something a room-timer change
  touches.
