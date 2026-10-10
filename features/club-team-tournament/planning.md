# Club team tournament — planning
See [user_story.md](user_story.md) · diagrams: [sequence](diagram/uml_diagram/sequence.md), [state](diagram/state.md).

## Open questions (resolve with the user before a todo)
1. How many clubs per event (2 only, or n)? Format between clubs: board-by-board (A1–B1, A2–B2…), swiss across all players, or round-robin of clubs?
2. Roster: fixed at registration, or captains may substitute between rounds? Ordering by rating (board order)?
3. Point values and tie-break at team level (equal totals)?
4. Absent/forfeited board: counts as loss, or team default?
5. Who may create (organizer only, or any club owner challenging another club)?
6. Rating: do these games affect individual ratings (rated flag)?

## Sequencing (after answers)
1. Design (schema: `team_entries`, roster table; new `team` format in the tournament module).
2. Backend pairing + scoring + tests. 3. Club roster UI + live standings. 4. Real-browser pass.
Link: [B200](../../docs/todo/B200-club-tabs-chat-events.md) (club tab lists it once built).
