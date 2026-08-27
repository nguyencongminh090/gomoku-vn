# Full Client-Side Prediction — Zero Perceived Latency (room.html) — User Story

## Origin

External prompt (AI-engineer-style spec), evaluated 2026-08-26, requesting an upgrade of the
optimistic-render overlay from TODO.md #153 ("faded, dashed-ring stone, sound + turn-bar still wait
for server") to a full Lichess/Chess.com-style Client-Side Prediction: 0ms stone, 0ms sound, 0ms
turn-bar/timer switch, with rollback on rejection. User accepted the trade-offs after a review that
flagged three risks — see [planning.md](planning.md) for the discussion.

## Actors

- **Mover** — the player who just clicked a cell. Wants zero felt delay between click and "it's
  placed", including sound and the turn indicator.
- **Opponent** — receives `game:moved` normally; must not be affected by the mover's local
  prediction (no change to what they receive or when).
- **Spectator** — same as Opponent: purely a broadcast consumer, must see moves exactly as before.
- **Server (authoritative)** — unchanged role: validates the move (occupied cell, turn order, wall
  Chebyshev, portal traversal, timeout), is the only writer of confirmed state. Existing #152 ack +
  retry + resync and #153 `moveId` idempotency stay intact.

## User stories

- As the **mover**, when I click an empty cell on my turn, I want to see my stone appear, hear the
  placement sound, and see the turn indicator flip to my opponent — instantly, without waiting for
  the round trip, even on a 150-200ms connection.
- As the **mover**, if my move turns out to be illegal (occupied meanwhile, wall violation, wrong
  turn due to a race) or the game ends before my ack lands, I want the stone, sound state, and turn
  bar to roll back cleanly to the true state — no page reload, no stuck UI.
- As the **opponent/spectator**, my experience must be unchanged: I still receive `game:moved` and
  hear the sound as before; the mover's prediction is invisible to me except that the move appears
  (as it always did).

## Existing precedent in the codebase (do not re-derive, do not duplicate)

- `client/js/board.js:851` `_drawOptimisticStone` — current 50%-opacity + dashed-ring overlay,
  decoupled from `this.board`. `optimisticStone` is a pure render-layer field, never merged into the
  authoritative board array.
- `client/js/game-ui.js:84` `sendMove` — `moveId` idempotency, `emitAck` with timeout → retry (same
  `moveId`) → resync-on-second-timeout, per TODO.md #152. Ack `{error}` currently only clears the
  overlay + shows a notice; ack timeout keeps the overlay in a "warning" (amber ring) state until
  resync's `room:joined` rebuild clears it.
- `client/js/room-socket.js:232` `game:moved` handler — gap check on `moveCount` (TODO.md #152 /
  #154), reconciles `optimisticStone` on matching coordinates, plays
  `audioManager.playMoveSound(isOpponent)` unconditionally today (no dedup for the mover's own
  predicted move).
- `client/js/game-ui.js:275` `updateBoardState` — the single source that paints turn-bar
  active-player highlight and timer values **from `gameState`** (authoritative). No local/predicted
  turn state exists today — turn-bar rendering has always read directly from server-confirmed
  `gameState.currentTurn`.
- No wall/portal configuration is available client-side (`roomData.settings` carries board size /
  rules label / timer / display prefs, not wall geometry) — confirms the "DO NOT duplicate complex
  server-side game logic" constraint isn't optional, it's also not currently *possible* without
  shipping new config to the client.

## Hard constraints (carried over from the prompt, confirmed with user)

- Never write an unconfirmed move into `gameState.board` — `optimisticStone`-style overlay only.
- Preserve `moveId` idempotency and the #152 ack/timeout/retry/resync mechanics unchanged.
- No duplication of server-only rules (wall Chebyshev, portal traversal) into the client — local
  pre-validation limited to what the client already authoritatively knows (see planning.md Q1).
- Opponent/spectator receive-path (`game:moved`, `game:ended`) unchanged in shape and timing.
- Graceful rollback on any rejection or game-over race, no reload required.
