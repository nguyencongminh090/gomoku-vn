# Tournament — Planning

Status: **discussion stage**. Nothing in this feature has been implemented or scheduled into
`TODO.md`/`instruction.md` yet. This file tracks the open questions that block moving from spec to
implementation planning, plus the sequencing once they're answered.

## Open questions (must resolve before implementation planning)

1. **Punishment definition** — What does "punishment" mean for a no-show beyond losing the round
   (point deduction, tournament elimination, suspension from future tournaments)? Severity/duration
   undefined.
2. **"Overtime (by date)" meaning** — Is the deadline per-round (shared cutoff for all pairs in a
   round), per-match (own window from when paired), or per-tournament (one global end date)?
3. **"Release user change date" meaning** — Does the organizer unilaterally reschedule a pair's
   match time, or approve/deny a player-initiated change request? Current spec assumes the latter
   (approval flow) — needs confirmation.
4. **Rule scope per format** — Do all three formats (Swiss, Round robin, Double Elimination) share
   one rule schema, or does each need its own (e.g. Double Elimination's upper/lower bracket rules
   don't apply to Round robin)?
5. **Double no-show handling** — If neither player shows by the deadline: double walkover (double
   loss), void/replay, or organizer decides case-by-case? See `DoubleNoShow` state in
   [diagram/state-diagram-match-lifecycle.md](diagram/state-diagram-match-lifecycle.md).
6. **Concurrency** — How many tournaments can run simultaneously? Can a player be in multiple
   tournaments (or multiple active matches) at once?
7. **Time control relationship to existing `TimerManager`** — Reuse the existing casual-game timer,
   or does the self-scheduled/server-verified flow need its own timer semantics?
8. **Site placement** — Where does the Tournament section live in the existing site (top-level nav,
   lobby sub-section, separate page)? Not decided.
9. **Tiebreaks** — What tiebreak rule(s) apply for tied standings (Round robin/Swiss especially)?
10. **Bracket/pairing algorithm** — Does the organizer configure/approve each round's pairings, or
    is pairing fully automatic per the chosen format's standard algorithm?

## Sequencing (once open questions are resolved)

1. Resolve open questions above with the user.
2. Formalize this feature into the repo's tracked-work convention: add
   `docs/todo/<CODE>-tournament.md` (+ `TODO.md` index line) and
   `docs/instruction/<CODE>-tournament.md` (+ `instruction.md` index line), per
   `CLAUDE.md`'s "New requirements/tasks: stack, don't perform directly" rule.
3. Data model / schema design (deferred — see the conceptual class diagram in
   [diagram/state-diagram-match-lifecycle.md](diagram/state-diagram-match-lifecycle.md), not final).
4. Server-side design: new tournament session/state handling, kept separate from
   `GameHandler`/`RoomHandler` per the architectural constraint in
   [user_story.md](user_story.md#architectural-constraint).
5. Implementation on a `feature/tournament` branch off `dev`, per `CLAUDE.md`'s feature-branch
   workflow.

## Related files

- [user_story.md](user_story.md) — actors, stories, rules, architectural constraint.
- [diagram/uml_diagram/sequence-match-scheduling.md](diagram/uml_diagram/sequence-match-scheduling.md) — scheduling sequence diagram.
- [diagram/state-diagram-match-lifecycle.md](diagram/state-diagram-match-lifecycle.md) — match state machine + conceptual structure.
