# Full CSP Zero Latency — Planning

Status: **resolved 2026-08-26** — Q1 resolved by derivation from existing code, Q2's sub-question
answered by the user (live tick). Formalized into `TODO.md` #155 / `docs/todo/B155-*.md` and
`instruction.md` B155 / `docs/instruction/B155-*.md`. This file is kept as the discussion record —
implementation should read the `docs/todo/`/`docs/instruction/` pair, not re-derive from here.

## Q1 — Local pre-validation before optimistic render (resolved)

User: "we can design the local check strictly before let server decide... prevent simple case."

Checked what the client already authoritatively has at click time (`user_story.md` precedent list):
`gameState.board`, `gameState.currentTurn`, `gameState.status`. It does **not** have wall/portal
geometry (`roomData.settings` carries board size/rules label/timer/display only) — so a "simple
case" pre-check is naturally bounded to what's already there, without shipping new config to the
client or duplicating server rules:

- Cell not empty (`gameState.board[y][x] !== EMPTY`) → **block locally**, don't even call `sendMove`
  (no optimistic stone, no sound, no wasted `emitAck`).
- Not my turn (`gameState.currentTurn !== myPlayer.color`) → block locally, same as today's
  `if (S().boardRenderer && S().boardRenderer.optimisticStone) return;` guard style
  (game-ui.js:209).
- `gameState.status !== 'ongoing'` → block locally (already effectively true — controls aren't
  rendered post-game, but worth an explicit guard given clicks can be optimistic now).

Anything past this (wall Chebyshev, portal traversal, swap2 phase rules) stays server-only and can
still reject the ack — the rollback path (Q2) handles that. This is strictly an early-exit
optimization to avoid predicting into cells the client can *already* prove are illegal, not a new
validation layer.

## Q2 — Turn-bar / timer optimistic switch + rollback mechanism (proposed, needs sign-off)

User: "Chúng ta cần có cơ chế quản lý chặt chẽ để hạn chế vấn đề này" + asked for how Full CSP is
typically implemented.

**Why this is the hard part**: `updateBoardState()` (game-ui.js:275) and the timer tick loop
(`renderTimers`, game-ui.js:305) both render directly from authoritative `gameState` today — there
is no local/predicted turn state, unlike the stone which already has `optimisticStone` as a
render-only overlay. Naively flipping `gameState.currentTurn` itself would violate the "never write
unconfirmed data into authoritative state" rule the stone overlay already established, and would
break the resync/rebuild path (`room:joined` fully rebuilds `gameState` from the server — a mutated
local `currentTurn` would just get overwritten anyway, but in between, other code that reads
`gameState.currentTurn` for real decisions, e.g. `S().boardRenderer.optimisticStone` guard, would be
looking at fiction).

**Proposed design** (standard CSP pattern — predict at the render layer, never at the state layer):

1. Introduce a **render-only overlay**, symmetric to `optimisticStone`, e.g.
   `RoomState.predictedTurn = { active: bool, forColor, snapshotTimerValues, switchedAtLocalTs }`.
   Lives beside `boardRenderer`/`gameState` in `RoomState`, not inside `gameState` itself.
2. `sendMove()` sets it right after `setOptimisticStone()`, using the *current* authoritative
   `gameState.timerValues` as the snapshot base — not a guess.
3. `updateBoardState()` and `renderTimers()` check `predictedTurn.active` first: if set, render the
   turn-bar highlight and the ticking countdown as if `currentTurn` already flipped, counting down
   from the snapshot using elapsed local time (`Date.now() - switchedAtLocalTs`) — same math pattern
   the real timer tick already uses, just against a different base color.
4. **Rollback** (ack error / game:ended race / ack-timeout-#2-resync): clear `predictedTurn.active`.
   Because `gameState.currentTurn`/`gameState.timerValues` were never touched, the very next
   `updateBoardState()` call renders the true state automatically — same "clearing the overlay IS
   the rollback" property the stone already has. No manual "restore snapshot" bookkeeping needed
   *if* the authoritative values were genuinely never mutated — this is the discipline the design
   depends on.
5. **Confirm** (`game:moved` matching `moveId`/coords): clear `predictedTurn.active` **and** let the
   normal `gameState.timerValues` write from the server payload be what renders next — i.e. snap to
   server truth rather than keep the locally-predicted countdown running. This avoids compounding
   drift: predicted countdown started at click time, server's authoritative clock started at
   server-processing time: the two disagree by ~RTT, and letting the prediction "win" on every move
   would accumulate error over a long game. Confirmation must always resync to server numbers, never
   keep the client's guess.

**Resolved (user, 2026-08-26)**: live tick — the opponent's predicted countdown starts running
immediately at click time (from the snapshot base), not a static highlight. Accepted trade-off: on
confirmation the number may visibly re-base to the server's real `timerValues` when RTT is large
enough to notice. Implementation should keep that re-base as a plain value snap (no animated
"catch-up"), matching step 5 above.

## Q3 — Test case matrix (checklist, not a decision)

Per `CLAUDE.md`'s "writing comprehensive test cases" rule — decision table for
`client/tests/game-optimistic-render.test.js` expansion:

| # | Ack/event outcome | Turn state at click | Expected stone | Expected turn-bar/timer | Expected audio |
|---|---|---|---|---|---|
| 1 | ack `{ok}` then `game:moved` (own move) | my turn | confirmed (no flicker) | snapped to server timerValues | suppressed (played at click) |
| 2 | ack `{error, code: CELL_OCCUPIED}` | my turn | cleared | reverted to mover via `updateBoardState()` | error cue, no move sound |
| 3 | ack `{error, code: WRONG_TURN}` (race) | stale local turn | cleared | reverted | error cue |
| 4 | ack `{error}` for wall/portal rejection | my turn | cleared | reverted | error cue |
| 5 | ack timeout #1 → retry → ack `{ok}` | my turn | stays predicted, ring→amber then confirmed | stays predicted through retry | not re-played on retry |
| 6 | ack timeout #1 → retry → timeout #2 → resync | my turn | cleared by `room:joined` rebuild | cleared by rebuild | none |
| 7 | `game:ended` arrives while ack pending (win) | my turn | cleared | timers stopped | win/lose sound, no move sound |
| 8 | `game:ended` arrives while ack pending (opponent timeout win) | my turn | cleared | timers stopped | win/lose sound |
| 9 | local pre-check blocks click (occupied cell, from Q1) | n/a | never predicted | unchanged | no sound at all |
| 10 | local pre-check blocks click (not my turn) | not my turn | never predicted | unchanged | no sound |
| 11 | opponent's `game:moved` (not mine) | n/a | opponent's stone drawn normally | flips to me, from server data (not predicted) | normal move sound plays |
| 12 | spectator receives `game:moved` | n/a | drawn normally | updates from server data | normal move sound plays |
| 13 | two rapid clicks before first ack resolves | my turn → predicted | second click blocked (Q1 "not my turn" once predicted, or explicit `predictedTurn.active` guard) | unchanged | no double sound |

Cases 1-8, 13 are new/expanded vs. current `game-optimistic-render.test.js` and
`game-move-ack-retry-resync.test.js`; 9-12 should already be implicitly covered but worth asserting
explicitly once the local pre-check (Q1) exists as new code.

## Next step

Once Q2's sub-question is answered, formalize into `docs/todo/B155-*.md` (or next free number after
#154) + `TODO.md`, and `docs/instruction/B155-*.md` + `instruction.md` carrying this design forward —
per `CLAUDE.md`, implementation should read that pair, not re-derive from this discussion file.
