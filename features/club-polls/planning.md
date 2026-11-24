# Club polls — Planning

Links: [user_story.md](user_story.md), [diagram/state.md](diagram/state.md), [diagram/uml_diagram/sequence.md](diagram/uml_diagram/sequence.md).

## Decisions (user, 2026-11-24 — all recommended options)
1. Any member creates; `cmdPoll` toggle default **on**; max 3 open polls per creator.
2. 2–6 options, single choice; tap another option = change vote, tap own option = remove vote.
3. Auto-close 24 h after creation + early close by creator or staff; staff delete (existing trash). Tallies visible to everyone at all times.
4. Named votes: tap a count to see who voted. `notifyPoll` (whole club, `club_poll`) default **off**, own 10-min cooldown.

## Open questions (resolved above)
1. Who creates: any member, or staff only? Toggle default on/off?
2. Options: 2–? options; single or multiple choice?
3. Close: manual by creator/staff, or a deadline? Results visible before voting?
4. Anonymous or named votes (who voted what)?
5. Notify the club on a new poll (reuse `club_all` cooldown?)

## Sequencing (after answers)
1. Migration: `club_polls`, `club_poll_votes`; `club_messages.kind` gains `poll` (CHECK rebuild needed: `-- rebuild` migration).
2. `ClubChatCommands`: `/binhchon` + `cmdPoll` toggle; vote route; tally in `listMessages`.
3. Client poll card + jsdom + real-browser pass.
