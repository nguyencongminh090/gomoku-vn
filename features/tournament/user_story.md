# Tournament — User Stories

Status: discussion draft, not yet implemented. See [planning.md](planning.md) for open questions
that must be resolved before implementation planning starts.

## Actors

- **Organizer** — creates and manages a tournament.
- **Player** — competes in a tournament.

## Organizer

- As an organizer, I want to create a tournament and choose its format (Swiss system, Round robin,
  or Double Elimination), so that I can run competitions matching the style I want.
- As an organizer, I want to configure the tournament's rules (board rules, win condition, time
  controls, tiebreak rules) separately from picking the format, so that the same format can be
  reused with different rule sets.
- As an organizer, I want to see the live bracket/standings and each pair's scheduling status, so
  that I can monitor whether matches are on track.
- As an organizer, I want to override or adjust rules for a running tournament, so that I can
  correct mistakes or handle exceptions.
- As an organizer, I want to resolve disputes between paired players (e.g., disagreement over an
  agreed match time), so that the tournament isn't blocked by unresolved conflicts.
- As an organizer, I want to eliminate, rearrange, or reassign players within the
  bracket/standings, so that I can handle no-shows, withdrawals, or errors.
- As an organizer, I want to approve or deny a player's request to change their scheduled match
  time, so that I retain control over tournament pacing while still accommodating reasonable
  requests.

## Player

- As a player, I want to see my paired opponent for the current round, so that I can arrange a
  match time with them.
- As a player, I want to report/submit the match time I agreed on with my opponent to the server,
  so that the system knows when to expect us.
- As a player, I want to arrive at the server and mark myself "ready" at the agreed time, so that
  the match starts once both sides are present.
- As a player, when both players are ready, I want the server to start the match and track the
  clock automatically, so that the result is computed without manual intervention.
- As a player, I want to know before the deadline passes whether my opponent has confirmed/shown
  up, so that I'm not left waiting indefinitely.
- As a player, if I'm ready and present but my opponent never shows, I want to be awarded the win
  with no penalty to me, so that I'm not disadvantaged by the other player's absence.
- As a player, I want to be able to request a schedule change through the organizer if the
  originally agreed time falls through, so that I have a path to recover from unavoidable
  conflicts.

## Rules (configurable per tournament)

- **Format**: Swiss system, Round robin, or Double Elimination — selected at creation.
- **Board/win rules**: standard gomoku rules, or organizer-defined variants (scope TBD).
- **Time control**: per-match clock settings (relationship to existing `TimerManager` TBD).
- **Scheduling window**: how long a pair has to agree on and report a match time before it's
  considered overdue (TBD).
- **Walkover policy**: if only one player is ready by the deadline, that player wins by walkover;
  the absent player scores zero for the round.
- **Punishment policy** for the absent player beyond the round loss — not yet defined.
- **Tiebreak rules**: how standings ties are broken (TBD).

## Architectural constraint

Tournament mode must be **separate from normal (casual) games** — it must not assume reuse of the
existing casual-game session path (`GameHandler`/`RoomHandler`) as-is. A tournament match likely
needs its own session/state handling, even though it may reuse lower-level primitives (e.g.
`TimerManager` for in-match clocks) once a match actually starts.
