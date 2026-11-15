# Home fill-space — user story

Links: [planning](planning.md)

- **Actors:** member, guest (lobby home `#screen-home`, tablet/desktop first).
- **Story:** as a player opening the home screen on a wide screen, I see what is happening on the site (games to watch, tournaments to join, puzzles to continue, forum talk) next to the play buttons, instead of an empty page.
- **Rules:** Chơi nhanh stays the single primary action; new blocks are secondary (no filled buttons). Only data `/api/home` already sends. Rows follow `docs/knowledge/ui-ux/ticket-rows.md`.
- **Hard constraints:** no `server/` change; no board/stones; phone layout and tab bar unchanged unless decided in planning Q3.
- **Diagram:** n/a — no new flow or state; layout only.
