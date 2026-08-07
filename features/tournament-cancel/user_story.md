# Tournament Cancel — User Story

Extends [features/tournament/user_story.md](../tournament/user_story.md) (base tournament feature,
already implemented — see `TODO.md`/`instruction.md` B48). That feature has exactly three
tournament statuses (`draft` → `active` → `completed`) and no way for an organizer to stop a
tournament before it reaches natural completion. This document covers adding a fourth, terminal
status: **`cancelled`**.

## Origin

User request, 2026-08-07: "Organizer can cancel Tournament (any time)."

## Actors

Same as base tournament feature: **Player**, **Organizer**, plus **Visitor/Spectator** (see
[../tournament-live-matches-browser/user_story.md](../tournament-live-matches-browser/user_story.md)
for that actor's own feature). This document does not redefine them.

## User stories

- As an **organizer**, I want to cancel my tournament at any time before it completes — whether it's
  still `draft` (not started) or already `active` (rounds in progress) — so I can stop it for any
  reason (real-world event cancelled, a mistake at creation, unresolvable dispute, etc.) without
  needing a specific precondition to be met first.
- As a **player** with a live game running when the organizer cancels, I want to be notified
  immediately and returned to the tournament page, rather than left in a match that silently stalls.
- As a **player or visitor** looking at a cancelled tournament afterward, I want to see it clearly
  marked "Đã huỷ" (Cancelled) — distinct from "Hoàn thành" (Completed) — plus whatever partial
  standings exist from games that did finish before the cancellation.
- As an **organizer**, once cancelled, I don't expect the tournament to be resumable — cancellation
  is a one-way, terminal action, same as completion.

## Resolved decisions (2026-08-07)

1. **New terminal status: `cancelled`.** Added alongside the existing `draft` / `active` /
   `completed` (`TournamentManager.js:104`). `cancelled` is reachable only from `draft` or `active`
   — never from `completed` (a finished tournament can't retroactively be cancelled) and never from
   `cancelled` itself (idempotent guard, not a re-entrant action).
2. **Organizer-only, following the existing `ORGANIZER_ONLY` pattern.** Same shape as
   `TournamentManager.startTournament()` (`tournament.organizerId !== organizerId` →
   `{error, code: 'ORGANIZER_ONLY'}`) and `PairingLifecycle.organizerAdjust()`/`organizerResolve()`.
   No co-organizer or admin-override concept exists in this codebase today, so none is introduced
   here.
3. **A live (`InProgress`) match is force-ended immediately, not left to finish.** The moment
   cancellation is processed, any pairing currently mid-game is killed: its `TimerManager` is
   destroyed, its `tournament-match:<pairingId>` socket room is notified and vacated, and its
   in-memory game context (`tournamentState.tournamentGameMap` entry) is torn down. No winner is
   recorded for that pairing.
4. **Every other non-terminal pairing (`Paired`/`Negotiating`/`Reported`/`Ready`) is also force-
   terminated**, not just `InProgress` ones — a cancelled tournament has zero pairings left "in
   flight" afterward. Already-terminal pairings (`Completed`/`Walkover`/`DoubleNoShow`/
   `OrganizerAdjusted`) are untouched — their results stand as history.
5. **Partial standings are computed and shown**, using the same ranking logic the base feature
   already runs at natural completion (`TournamentManager._completeTournament`'s standings
   computation), fed only by the pairings that did reach `Completed` before cancellation. The UI
   must visually distinguish this from a normal completed-tournament standings table (e.g. a
   "standings are partial — tournament was cancelled" note), since the ranking does not reflect a
   finished competition.
6. **Cancellation reason is optional, freeform text**, mirroring `PairingLifecycle.organizerAdjust`'s
   existing `reason` parameter — stored on the tournament record, shown to players/visitors so they
   know why (not required to cancel, since the organizer shouldn't be blocked by a form field).

## Related files

- [planning.md](planning.md) — implementation sequencing + remaining open (non-blocking) questions.
- [diagram/state-diagram-tournament-lifecycle.md](diagram/state-diagram-tournament-lifecycle.md) —
  the base 3-status lifecycle extended with `cancelled`.
- [diagram/uml_diagram/sequence-cancel-tournament.md](diagram/uml_diagram/sequence-cancel-tournament.md)
  — full cancel flow: organizer action → live-match teardown → broadcasts to all affected clients.
- [../tournament/user_story.md](../tournament/user_story.md) — base tournament feature this extends.
