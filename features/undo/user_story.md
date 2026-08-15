# Undo (room.html) — User Story

## Origin

User request, 2026-08-15: "Scope: Room. Add Undo function." Terse initial ask — per `CLAUDE.md`'s
"short/underspecified prompts: enhance, confirm, then execute" rule, four design questions were
asked before starting this discussion folder. Answers below are locked; everything else is still
open (see [planning.md](planning.md)).

## Actors

- **Player** (seated, `room.html`, mid-match) — the one who requests or responds to Undo.
- **Opponent** (the other seated player) — must approve or decline the request.
- **Spectator** — read-only; sees the outcome (board change, system chat line) but has no Undo
  controls, same as existing draw-offer/time-request spectator visibility.

## User stories

- As a **player who just made a mistake**, I want to ask my opponent to undo the last round, so a
  misclick or a rules misunderstanding doesn't decide the game.
- As the **opponent**, I want to explicitly approve or decline an undo request, so my position isn't
  taken back without my consent (mirrors how draw offers already work).
- As a **player**, I want no cap on how many times I can request Undo in a game (per the resolved
  decision below) — the opponent's approval is the only gate, not a counter.
- As a **spectator**, I want to see the result of an undo (board reverts, chat system line), the same
  passive visibility I already have for draw offers and time requests.

## Resolved decisions (confirmed with user, 2026-08-15)

1. **Approval flow**: opponent must explicitly approve — not instant/unilateral. Matches the existing
   draw-offer pattern (`offerDraw`/`acceptDraw`/`declineDraw`, `server/managers/GameEngine.js:439-489`)
   more than the auto-grant-then-approval-only-after-quota `game:request_time` pattern
   (`server/socket/handlers/GameHandler.js:311-371`), since there is no quota here (see #3).
2. **Room scope**: `room.html` only (casual/free rooms). **Not** available in tournament matches
   (`TournamentMatchHandler.js`) — competitive integrity, matches the existing precedent that
   `docs/todo/`-tracked features are frequently split this way.
3. **Undo limit**: unlimited — either player may request Undo any number of times per game, gated
   only by opponent approval each time (no quota/counter needed, unlike `TIME_REQUEST_FREE`).
4. **Undo depth — core rule**: *"Undo to requester turn (đi lại ở lượt cuối cùng của người yêu
   cầu)"* — an accepted Undo always rolls back to right before the **requester's own most recent
   move**, landing back on the requester's turn. If the opponent already replied, that reply is
   rolled back too (the "one full round" case); if not, only the requester's own stone is removed.
   One rule, no separate edge case. See [planning.md](planning.md#core-rule-users-final-summary-2026-08-15)
   for the derived `targetIndex` algorithm.
5. **Requestable anytime**, including mid-opponent's-turn (not gated to "only after the round
   completes").
6. **Swap2 opening phase**: Undo must also work there — exact mechanics not yet designed (opening
   placement doesn't use `moveHistory` the normal way); flagged for implementation-time design.
7. **Timer**: only `per_move` mode timer state is effectively restored (and needs no new code, since
   it already resets to full every move); `blitz`/`per_game` keep whatever time was already spent.
8. **Reconnect visibility**: a pending request is not cleared on disconnect, and must be visible to a
   reconnecting opponent — requires adding `undoOffer` to `GameEngine.serialize()` (not covered by
   existing `drawOffer` precedent, which `serialize()` omits entirely).
9. **Non-blocking + conditional auto-cancel**: Undo doesn't pause gameplay. The opponent replying
   does not cancel a pending request (it still resolves correctly on accept). Only the **requester**
   making another move cancels their own pending request.

## Existing precedent in the codebase

- **Request/approve/decline shape**: `game:draw_offer` / `game:draw_accept` / `game:draw_decline`
  (`GameHandler.js:243-307`, backed by `GameEngine.offerDraw/acceptDraw/declineDraw`,
  `GameEngine.js:439-489`) is the closest 1:1 analog — a pending request object, opponent-only
  accept/decline, a `chat:message` system line on each transition, self-accept/self-decline blocked.
  `game:request_time` / `game:time_accept` / `game:time_decline` (`GameHandler.js:311-446`) is a
  second, richer analog: it stores its pending state on the **room** object
  (`room._timeRequestPending`) rather than on the `GameEngine` instance, and additionally restricts
  *when* a request can be made (`engine.currentTurn !== user.userId` → rejected). Undo will need to
  decide which container (engine vs. room) its pending state lives in, and what turn-timing
  restriction (if any) applies — see planning.md open questions.
- **Move state to roll back**: `GameEngine.makeMove()` (`GameEngine.js:146-243`) is the single mutation
  point per move — writes `this.board[y][x] = color`, increments `this.moveCount`, pushes
  `{x, y, color, timestamp}` onto `this.moveHistory`, clears any pending `this.drawOffer`, and flips
  `this.currentTurn`. An undo of one round needs to reverse exactly these fields for the last two
  entries in `moveHistory` (or one, if the round is currently incomplete — see planning.md).
- **Wire shape is delta, not resync**: `game:moved` (`GameHandler.js:79-103`) sends only
  `{x, y, color, nextTurn, moveCount, timer}`; the client applies that single cell rather than
  receiving a full board resync (`client/js/room-socket.js` `game:moved` handler). An undo event
  will need the **opposite** shape — telling the client which cell(s) to clear, not which to fill —
  since there's no existing "remove a stone" wire message to reuse as-is.
- **Timer coupling**: `GameHandler.js:91-99` calls `timer.switchTurn()` on every accepted move, which
  for `per_move` mode resets the mover's clock to full (`TimerManager.applyMove`,
  `TimerManager.js:99-111`) and for `blitz` mode adds the increment. `TimerManager` has no reverse
  operation today (only forward `applyMove`/`addTime`/`switchTurn`) — restoring exact pre-round timer
  state after an accepted undo is an open design question, not a solved one. See planning.md.
- **Swap2 opening moves are a separate code path**: `placeOpeningStone()` / `game:swap2_place`
  (`GameEngine.js` around `260-330`, `GameHandler.js:130-165`) has its own `openingPhase` state
  machine and doesn't go through `makeMove()`/`moveHistory` the same way. Whether Undo applies during
  the Swap2 opening phase, or is blocked until `openingPhase === 'play'`, is unresolved.
- **No disconnect cleanup precedent found**: neither `drawOffer` nor `room._timeRequestPending` is
  explicitly cleared in `DisconnectHandler.js` today (grep came back empty) — Undo can either match
  this existing gap or close it; flagged as an open question rather than assumed.

## Related files

- [planning.md](planning.md) — open questions, implementation sketch, sequencing.
- [diagram/uml_diagram/sequence-undo-request.md](diagram/uml_diagram/sequence-undo-request.md) —
  request → approve → rollback flow.
- [diagram/state-undo-request.md](diagram/state-undo-request.md) — pending-request lifecycle.
