# Tournament Cancel — Planning

Status: **implemented (2026-08-07)** on `feature/tournament-cancel` (off `dev`) — see
`docs/todo/B59-*.md` for the final summary, including how the "partial standings" open question below
was actually resolved at code time (no new backend standings computation needed at all).

## Current-state findings (research, 2026-08-07)

- There is **no cancel/abort mechanism today** — grepped the whole `server/` tree, nothing. The only
  existing status transitions are `draft` → `active` (`TournamentManager.startTournament()`,
  organizer-only) and `active` → `completed` (`_completeTournament()`, called only from natural
  round/bracket-completion paths — `_checkDoubleElimComplete()`, `_advanceIfRoundComplete()`).
- `PairingLifecycle.organizerAdjust()` (`PairingLifecycle.js:176-187`) is the closest existing
  precedent — an organizer-only, force-terminal pairing transition — but it's currently restricted
  to `Negotiating`/`Reported` states only. It **cannot** be reused unmodified for cancelling a
  pairing that's `Ready` or `InProgress` (a live match with an active `TimerManager` + `GameEngine`
  context), since those need actual socket/timer teardown, not just a state-field flip.
- The only existing "tear a live match down" code path is `TournamentMatchHandler._endMatch()`
  (`TournamentMatchHandler.js:312-360`), but it's only ever invoked from in-game outcomes reached
  through `GameEngine` (timeout, resign, win, draw-accept) — nothing calls it for an
  organizer-initiated, mid-game force-stop today.
- `tournamentState.shutdown()` (`tournamentState.js:81-87`) is the only existing "tear everything
  down" routine, but it's **whole-process** scope (every tournament, every timer/game), not scoped
  to one tournament. None of `tournamentTimerMap` / `tournamentGameMap` / the deadline-sweep
  structures are keyed by `tournamentId` — only by `pairingId` — so a per-tournament cancel must
  first enumerate that tournament's pairings (`tournamentManager.listPairings(tournamentId)`) to get
  the affected `pairingId`s before it can selectively tear each one down.

## Resolved decisions (2026-08-07)

See [user_story.md](user_story.md#resolved-decisions-2026-08-07) for the full list (new `cancelled`
status, organizer-only, live match force-ended immediately, all non-terminal pairings terminated,
partial standings computed, optional freeform reason). Key mechanism confirmed with the user:

- **Live match on cancel → force-end immediately** (not "let it finish, block new rounds"). Chosen
  because a soft-cancel that lets an in-flight game keep running leaves the tournament in an
  ambiguous half-cancelled state for an indeterminate time, and the organizer explicitly asked for
  "cancel any time" — implying an immediate stop, not a scheduled one.
- **Partial standings ARE computed and shown** (not "no standings at all"). Chosen so that games
  already fairly played before cancellation aren't simply discarded from the record — players who
  won games get that reflected, even though the tournament as a whole didn't reach a real
  conclusion.

## Implementation sketch (for the eventual TODO/instruction entry — not yet formalized)

1. **`TournamentManager.cancelTournament(organizerId, tournamentId, reason)`** — new method, mirrors
   `startTournament()`'s shape:
   - `ORGANIZER_ONLY` check (`tournament.organizerId !== organizerId`).
   - Status guard: only from `draft` or `active` (`INVALID_STATE`/similar code otherwise — reuses
     the `TOURNAMENT_ALREADY_STARTED`-style error shape already used elsewhere, e.g.
     `unregisterPlayer`'s `TOURNAMENT_ALREADY_STARTED` at `TournamentManager.js:200`).
   - Enumerate all pairings for `tournamentId`, filter to non-terminal (`state` not in
     `PairingLifecycle.TERMINAL_STATES`).
   - For each: if `state === 'InProgress'`, do the live-match teardown (new helper, likely living in
     `TournamentMatchHandler.js` alongside `_endMatch`, since that's where `matchRoom`/socket-room
     knowledge already lives) — emit a cancellation event into `tournament-match:<pairingId>`,
     `socketsLeave`, `_teardownPairingTimer(pairingId)`, delete `tournamentGameMap` entry, untrack
     any pending deadline. Otherwise, transition the pairing straight to a new terminal state (see
     open question below) without touching sockets.
   - Compute partial standings from whatever pairings are `Completed`, reusing
     `_completeTournament`'s existing standings-computation logic (needs to be extracted into a
     shared helper if it's currently inlined only in `_completeTournament`) — verify this at
     implementation time rather than assuming a clean extraction point exists.
   - Persist: `tournament.status = 'cancelled'`, `tournament.cancelledAt`, `tournament.cancelReason`
     (nullable), via `database.updateTournamentStatus` (existing method, may need a new optional
     param) or a new `database.cancelTournament`-style call — verify existing DB helper shape first.
   - Emit a `tournament_cancelled` event (mirrors the existing `tournament_completed` emit at
     `TournamentManager.js:862`) for whatever broadcast wiring picks that up in `TournamentHandler`.
2. **`TournamentHandler.js`**: new `socket.on('tournament:cancel', ...)` following the exact wiring
   pattern of the existing `tournament:start` handler (`TournamentHandler.js:296-308`) — call the
   manager method, on success broadcast to the tournament room (`tournamentRoom(tournamentId)`,
   already used by `tournament:get`) and to whatever the lobby list already listens on for live
   status updates (verify the exact existing channel/event name at implementation time — don't
   invent a new one if `tournaments.js`'s lobby refresh already has one).
3. **Client — `tournaments.js` (lobby card)**: a "Huỷ giải đấu" (Cancel Tournament) action, gated by
   `isOrganizer` and `tournament.status === 'draft' || tournament.status === 'active'` (i.e. the
   inverse of today's `if (tournament.status === 'draft')` gate around the whole `actions` block —
   Cancel needs its own, broader gate since Start only applies to `draft`).
4. **Client — `tournament.html`/`tournament-detail.js`**: no existing tournament-level (as opposed to
   pairing-level) organizer control exists in the detail page today — this needs a new UI slot, most
   naturally near `detail-name`/`detail-meta` in the header. Reuse the existing danger-styled
   confirm-modal pattern already established for pairing adjustment (`client/tournament.html:164-180`,
   `.btn-cancel` with `--c-danger` background) rather than a bare `confirm()` dialog, since this is a
   destructive, tournament-wide action — add an optional reason textarea, matching
   `organizerAdjust`'s existing `reason` field pattern.
5. **Client — `tournament-match.js`**: listen for the new cancellation broadcast (reusing the
   existing `tmatch:ended`-adjacent pattern, or a distinct new event — see open question below);
   show a distinct overlay message ("Giải đấu đã bị huỷ bởi người tổ chức" / tournament cancelled by
   organizer) and redirect back to `tournament.html`, following the same redirect pattern already
   used for `NO_ACTIVE_MATCH` (`tournament-match.js:94-97`).

## Open questions (non-blocking — can default and adjust later)

1. **New pairing terminal state name.** Should the force-terminated pairing state during a cancel be
   a brand-new `'Cancelled'` value in `PairingLifecycle.TERMINAL_STATES`, or reuse the existing
   `'OrganizerAdjusted'` (with `result.reason = 'tournament_cancelled'` distinguishing it)? Reusing
   avoids touching every place that already handles `OrganizerAdjusted` in the UI (pairing card
   rendering, standings exclusion), but semantically conflates "organizer rearranged this one pairing"
   with "the whole tournament was cancelled." **Leaning toward a new `'Cancelled'` state** for
   clarity, to confirm at implementation time once the UI rendering surface for pairing states is
   back in view.
2. **Live-match cancellation socket event name.** Reuse `tmatch:ended` with a special
   `result.reason === 'tournament_cancelled'` field (client already has a `tmatch:ended` handler to
   extend), or a brand-new `tmatch:tournament_cancelled` event (clearer intent, but one more event
   type to wire/test)? **Leaning toward reusing `tmatch:ended`** with a reason flag, consistent with
   how `_endMatch` already threads different `engineResult` shapes through one event for
   timeout/resign/win/draw.
3. **Lobby visibility of cancelled tournaments**: stay visible in the list (like `completed` ones,
   just with a distinct "Đã huỷ" badge and no action buttons), or hidden from the default list view?
   **Leaning toward staying visible**, consistent with not deleting/hiding historical data anywhere
   else in this codebase (completed tournaments aren't hidden either).

None of these three block writing the `TODO.md`/`instruction.md` entry — they're implementation
details to nail down at that point, not open design questions that change the shape of the feature.

## Sequencing

1. ~~Resolve core open questions with the user.~~ ✅ Done 2026-08-07 (live-match handling, partial
   standings).
2. ~~Formalize into `TODO.md`/`instruction.md`.~~ ✅ Done 2026-08-07 — code **B59**
   (`docs/todo/B59-*.md`, `docs/instruction/B59-*.md`).
3. Data model: `cancelled` status + `cancelledAt`/`cancelReason` fields on the tournament record,
   `server/db/schema.sql` migration if the tournaments table needs new columns.
4. `PairingLifecycle.js` + `TournamentManager.js`: the force-terminate-all-non-terminal-pairings
   mechanism (resolve open question 1 first).
5. `TournamentMatchHandler.js`: live-match teardown helper (resolve open question 2 first).
6. `TournamentHandler.js`: `tournament:cancel` socket handler + broadcast wiring.
7. Client: lobby Cancel button, tournament-detail Cancel control + confirm modal, `tournament-match.js`
   cancellation overlay/redirect — on a new `feature/tournament-cancel` branch off `dev`, per
   `CLAUDE.md`'s feature-branch workflow.
8. Unit tests (`server/tests/TournamentManager.test.js`) per `CLAUDE.md`'s "Writing comprehensive
   test cases" rule — cover: cancel from `draft`, cancel from `active` with a live `InProgress`
   pairing, cancel from `active` with pairings in every non-terminal state simultaneously, cancel
   attempted by a non-organizer (`ORGANIZER_ONLY`), cancel attempted twice (`INVALID_STATE`/idempotent
   guard), cancel attempted on an already-`completed` tournament.

## Related files

- [user_story.md](user_story.md) — actors, stories, resolved decisions.
- [diagram/state-diagram-tournament-lifecycle.md](diagram/state-diagram-tournament-lifecycle.md)
- [diagram/uml_diagram/sequence-cancel-tournament.md](diagram/uml_diagram/sequence-cancel-tournament.md)
- [../tournament/planning.md](../tournament/planning.md) — base tournament feature (already
  implemented, B48) that this extends.
