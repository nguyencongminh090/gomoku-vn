# Undo (room.html) — Planning

Status: **resolved 2026-08-15** — all open questions below answered by the user; formalized into
`TODO.md` #128 / `docs/todo/B128-*.md` and `instruction.md` B128 / `docs/instruction/B128-*.md`.
This file is kept as the discussion record — implementation should read the `docs/todo/`/
`docs/instruction/` pair, not re-derive from here.

## Current-state findings (research, 2026-08-15)

See [user_story.md](user_story.md#existing-precedent-in-the-codebase) for the full precedent list
(draw-offer flow, request_time flow, `makeMove()` mutation points, delta wire shape, timer coupling,
Swap2 opening-phase separation, disconnect-cleanup gap). Summary of what an Undo implementation would
touch:

- `server/managers/GameEngine.js` — new `requestUndo`/`acceptUndo`/`declineUndo` methods (mirroring
  `offerDraw`/`acceptDraw`/`declineDraw`), plus the actual rollback logic (pop last 1-2
  `moveHistory` entries, clear the corresponding `board` cells back to `EMPTY`, decrement
  `moveCount`, restore `currentTurn`).
- `server/socket/handlers/GameHandler.js` — new `game:undo_request` / `game:undo_accept` /
  `game:undo_decline` socket events, following the `game:draw_offer` block's shape
  (`GameHandler.js:243-307`) for the request/decline messages, but needing a **new** broadcast event
  (e.g. `game:undo_applied`) on accept, since there's no existing "remove a stone from the board"
  client message to reuse — `game:moved` is fill-only.
- `client/js/room-socket.js` / `client/js/room.js` (or wherever `game:moved` /
  `game:draw_offered` are currently handled) — new listeners for the undo request/offered/applied
  events, board-cell-clearing render logic (inverse of however `game:moved` currently paints a
  stone), and UI for the request/approve/decline prompt (likely reusing whatever modal/toast pattern
  the existing draw-offer prompt uses — needs a look at the client draw-offer UI before implementing).
- `client/js/move-tree.js` / `client/js/history.js` — if a move-tree/history panel already renders
  the live move list (used by `fromMoveHistory()`), it needs to shrink in sync with an accepted undo,
  not just the board.

## Resolved decisions (user answers, 2026-08-15)

1. **Pending-state container**: left to implementation (user had no strong preference — "chưa rõ
   lắm"). Decided during formalization: **engine-level** (`this.undoOffer`), matching the closer
   analog (`drawOffer`) rather than the room-level `_timeRequestPending` pattern — no reason surfaced
   to prefer the room-level container.
2. **When can Undo be requested?** "Ngay trong khi chờ" — requestable **immediately**, including
   while it is still the opponent's turn (opponent hasn't replied yet). Not restricted to "only after
   the round completes."
3. **Fewer than 2 moves played** (opponent hasn't replied to the requester's last stone yet): "Vẫn
   cho phép 1 undo" — still allowed, rolls back just that one stone. This is not actually a separate
   special case once the core rule (below) is applied uniformly — see "Core rule" below.
4. **Swap2 opening phase**: "Vẫn cho phép" — Undo must also work during the Swap2 opening sequence
   (`placeOpeningStone`/`swap2Choice`, `openingPhase !== 'play'`). **Not fully designed yet** — the
   opening phase doesn't use `moveHistory`/`makeMove()` the same way (place3 places 3 stones in one
   action, p1choice/p2choice are decisions, not placements). The exact "what does one Undo roll back"
   semantics for each opening sub-phase needs to be nailed down during implementation, not assumed —
   flagged explicitly in `docs/instruction/B128-*.md`.
5. **Timer restoration on accept**: "Có khôi phục timer khi per move (và chỉ trong per move), blitz/
   per_game không tính" — only `per_move` mode restores; `blitz`/`per_game` do **not** get elapsed
   time or increments given back. This turns out to need **no new `TimerManager` code**: `per_move`
   already resets the mover's clock to full on every move (`TimerManager.applyMove`,
   `TimerManager.js:99-106`), so after undoing the moves nothing needs restoring — accept just needs
   to call `timer.switchTurn(requesterColor)` to point `activeColor` back at the requester, same as a
   normal move would. `blitz`/`per_game` also just need the `switchTurn` call — no seconds/increment
   reversal, matching the decision.
6. **Chat/system messaging wording**: request = `"<name> xin đi lại."` (user's exact phrase).
   Accept/decline follow the existing draw-offer copy pattern (`GAME_DRAW_AGREED`/`GAME_DRAW_DECLINED`
   → `"<name> đồng ý hoà."`/`"<name> từ chối hoà."`): propose `"<name> đồng ý đi lại."` /
   `"<name> từ chối đi lại."` — confirm exact copy during implementation if it reads oddly in context.
7. **Disconnect handling**: "Không cần hủy, vẫn giữ, nhưng khi reconnect, người kia vẫn phải thấy yêu
   cầu undo." — pending request is **not** cleared on disconnect (matches the existing `drawOffer`/
   `_timeRequestPending` gap), but reconnect **must** surface it. Checked: `GameEngine.serialize()`
   (`GameEngine.js:515-542`, sent as `payload.gameState` on reconnect — `SocketHandler.js:217`) does
   **not** currently include `drawOffer` at all, so this is a **new requirement**, not something
   existing precedent already covers — `serialize()` needs a new `undoOffer` field.
8. **Undo does not block gameplay**: "Undo không chặn luồng chơi... chỉ cancel khi người request đi
   tiếp." Both players may keep moving while a request is pending. If the **requester** makes another
   move, their own pending request auto-cancels. If the **opponent** moves (replies), the pending
   request stays valid and will still resolve correctly on accept (see core rule below) — this differs
   from `drawOffer`, which is unconditionally cleared on *any* move by *either* player
   (`GameEngine.js:216`); Undo's auto-cancel must be conditional on the mover being the requester.

## Core rule (user's final summary, 2026-08-15)

> "Undo to requester turn (đi lại ở lượt cuối cùng của người yêu cầu)." Ở lượt đối thủ, người chơi
> yêu cầu undo → cũng đi lại nước của người yêu cầu.

One rule covers both the "full round" default and the "1 stone, opponent hasn't replied" edge case
(#3): an accepted Undo always rolls back to **right before the requester's own most recent move**,
landing on the requester's turn again — never further back, never less.

**Derived algorithm** (not yet implemented — this is the planning-stage design, verify against real
code when writing `requestUndo`/`acceptUndo`):

- On `requestUndo(userId)`: snapshot `targetIndex` = index in `moveHistory` of the **last** entry
  whose color belongs to the requester (`moveHistory.findLastIndex` by color). Store
  `this.undoOffer = { from: userId, targetIndex }`. Snapshotting at request time (not recomputing at
  accept time) is what makes rule #8 correct: if the opponent replies before the request is accepted,
  `targetIndex` still points at the requester's original move, so accept still rolls back exactly to
  right before it — removing both the requester's move and the opponent's reply that came after.
  Because the requester's own next move auto-cancels the pending offer (#8), at most **one** extra
  entry (the opponent's single reply) can ever accumulate past `targetIndex` before accept/decline —
  no unbounded-lookback case to handle.
- Reject the request if the requester has **no** entry in `moveHistory` yet (they haven't moved at
  all this game — nothing of theirs to undo to).
- On `acceptUndo(userId)`: truncate `moveHistory` to `targetIndex` entries, reset `board[y][x] =
  EMPTY` for each removed entry, decrement `moveCount` by the removed count, set `currentTurn =
  undoOffer.from`, clear `undoOffer`, call `timer.switchTurn(requesterColor)` (see #5).
- On `declineUndo(userId)`: clear `undoOffer`, no board/turn change (mirrors `declineDraw`).
- In `makeMove(userId, ...)`: if `this.undoOffer && this.undoOffer.from === userId`, clear
  `this.undoOffer` **before** processing the move (auto-cancel per #8) — do **not** clear it when the
  mover is the opponent.

## Implementation sketch

See `docs/instruction/B128-*.md` for the authoritative sequencing/boundaries — summary:

1. `GameEngine.js`: add `requestUndo`/`acceptUndo`/`declineUndo` + the `targetIndex` rollback
   algorithm above, plus the conditional (requester-only) auto-cancel in `makeMove()`. Extend
   `serialize()` with `undoOffer` (resolved decision #7).
2. Unit tests (`server/tests/GameEngine.test.js`, pattern-match `offerDraw`/`acceptDraw`/
   `declineDraw` coverage) — happy path (mid-opponent's-turn request and post-reply request, both
   landing correctly), self-accept/self-decline blocked, no-move-yet rejected, opponent's move
   doesn't cancel but requester's does, `serialize()` includes a pending offer.
3. `GameHandler.js`: `game:undo_request`/`game:undo_accept`/`game:undo_decline` + new
   `game:undo_applied` broadcast (cell-clearing payload) + chat system lines (wording per decision
   #6).
4. Swap2 opening-phase support (decision #4) — separate design pass, not a direct extension of the
   `moveHistory` algorithm above.
5. Client: listeners, UI prompt, board-cell-clearing render, move-tree/history sync if applicable.
6. Cache-busting `?v=N` bump per `CLAUDE.md` for any `client/css`/`client/js` change.
7. Feature-completion checklist: backend Jest + real-browser two-tab walkthrough before marking done.

## Sequencing

1. ~~Resolve open questions with the user~~ — done, 2026-08-15.
2. ~~Formalize into `docs/todo/`/`TODO.md` + `docs/instruction/`/`instruction.md`~~ — done, see
   `TODO.md` #128, `docs/todo/B128-*.md`, `docs/instruction/B128-*.md`.
3. Implement on a `feature/undo` branch off `dev`, per the `git-workflow` skill.
4. Backend Jest tests + real-browser two-player walkthrough before marking
   `docs/todo/B128-*.md` "đã xong".

## Related files

- [user_story.md](user_story.md) — actors, stories, resolved decisions, precedent notes.
- [diagram/uml_diagram/sequence-undo-request.md](diagram/uml_diagram/sequence-undo-request.md)
- [diagram/state-undo-request.md](diagram/state-undo-request.md)
