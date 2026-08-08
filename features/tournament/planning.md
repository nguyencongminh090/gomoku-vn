# Tournament — Planning

Status: **decisions locked (2026-08-05)**. All 10 open questions below have been answered by the
user. `TODO.md`/`instruction.md` B48 already tracks this feature. Next step is implementation
planning/build-out — see [Sequencing](#sequencing-sonuk-implementation).

## Resolved decisions (2026-08-05)

1. **Punishment** — Round loss only. No point deduction, no elimination, no suspension beyond
   losing that round's walkover.
2. **"Overtime (by date)" scope** — Per-match window: each pair's deadline is counted from when
   they were paired (own window), not a shared per-round or per-tournament cutoff.
3. **Reschedule control** — Organizer approves/denies a player-initiated change request. Organizer
   cannot unilaterally override a pair's agreed time without a request.
4. **Rule schema scope** — One shared `RuleSet` schema applies across all three formats (Swiss,
   Round robin, Double Elimination). No per-format rule schema.
5. **Double no-show** — Void/replay. If neither player shows by the deadline, the match is voided
   and rescheduled/replayed — not scored as a double walkover.
6. **Concurrency** — Unrestricted. No cap on concurrent tournaments or a player's simultaneous
   active tournaments/matches for the initial version.
7. **Timer relationship** — Reuse the existing `TimerManager` once a match actually starts (both
   players ready). The self-scheduled/server-verified deadline flow (pairing → negotiate → report →
   ready) is separate tournament-scheduling logic, not part of `TimerManager`.
8. **Site placement** — Single Lobby page, tab switcher ("Bàn chơi" / "Giải đấu"), not a separate
   `/tournaments` route. (Decided earlier, during the blueprint discussion — see
   [user_story.md](user_story.md).)
9. **Tiebreaks** — Buchholz/Sonneborn-Berger (opponent-strength-weighted), applied uniformly since
   rule schema is shared across formats (decision 4).
10. **Pairing algorithm** — Fully automatic per the chosen format's standard algorithm (Swiss
    pairing, round-robin schedule, bracket seeding). No organizer approval step per round.

## Sequencing — implementation

1. ~~Resolve open questions above with the user.~~ ✅ Done 2026-08-05.
2. ~~Formalize this feature into the repo's tracked-work convention.~~ ✅ Done — `TODO.md` #48 /
   `instruction.md` B48.
3. Data model / schema design — turn the conceptual class diagram in
   [diagram/state-diagram-match-lifecycle.md](diagram/state-diagram-match-lifecycle.md) into real
   `server/db/schema.sql` tables, informed by decisions 1-10 above.
4. Server-side design: new `TournamentManager` + tournament socket handler, kept separate from
   `GameHandler`/`RoomHandler` per the architectural constraint in
   [user_story.md](user_story.md#architectural-constraint); reuses `TimerManager` per decision 7.
5. Wire the already-approved UI (`client/tables-tournaments-mockup.html`) into
   `client/index.html`/`client/js/lobby.js`.
6. Implementation continues on `feature/tables-tournaments-mockup` (or a new `feature/tournament-*`
   branch off `dev` if split further), per `CLAUDE.md`'s feature-branch workflow.

## Related files

- [user_story.md](user_story.md) — actors, stories, rules, architectural constraint.
- [diagram/uml_diagram/sequence-match-scheduling.md](diagram/uml_diagram/sequence-match-scheduling.md) — scheduling sequence diagram.
- [diagram/state-diagram-match-lifecycle.md](diagram/state-diagram-match-lifecycle.md) — match state machine + conceptual structure.
