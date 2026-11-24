# Club polls — Planning

Links: [user_story.md](user_story.md), [diagram/state.md](diagram/state.md), [diagram/uml_diagram/sequence.md](diagram/uml_diagram/sequence.md).

## Open questions (ask the user before any code)
1. Who creates: any member, or staff only? Toggle default on/off?
2. Options: 2–? options; single or multiple choice?
3. Close: manual by creator/staff, or a deadline? Results visible before voting?
4. Anonymous or named votes (who voted what)?
5. Notify the club on a new poll (reuse `club_all` cooldown?)

## Sequencing (after answers)
1. Migration: `club_polls`, `club_poll_votes`; `club_messages.kind` gains `poll` (CHECK rebuild needed: `-- rebuild` migration).
2. `ClubChatCommands`: `/binhchon` + `cmdPoll` toggle; vote route; tally in `listMessages`.
3. Client poll card + jsdom + real-browser pass.
