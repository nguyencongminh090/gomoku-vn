# Room redesign — planning

Links: [user_story.md](user_story.md) · [state](diagram/state-room-layout.md) ·
[sequence](diagram/uml_diagram/sequence-friendly-only.md)

## Sequencing (branch `ui/room-arena` off `dev`)
1. Mockup `client/room-arena-mockup.html` (desktop + mobile) → user review.
2. Layout restructure of `room.html` + new `room-arena.css` (replaces zen chrome on the room).
3. SVG board renderer with the `BoardRenderer` public API (setState/resize/onCellClick/
   optimistic stone/pending) → room first; other pages decided in Q2.
4. Friendly-only undo/time: server guard + tests, client hides buttons; rename "Chơi thường" → "Giao hữu".
5. Board settings: theme, palette presets, custom colours, coords mode, quiet WCAG toast.
6. Live review desktop + mobile, screenshots, ux-audit pass.

## Resolved (user, 2026-10-10)
- Q1 Giao hữu = effectively not rated (`RatingService.isRatedGame` false), incl. a guest seated in a ranked room.
- Q2 SVG board replaces `BoardRenderer` on **every** page (room, tournament-match, replay, puzzle, editor, review, diag).
- Q3 Board settings per-device (localStorage), no server storage; one store, edited only in Settings › Giao diện › Bàn cờ (user follow-up), shared by all boards.
- Direction: one "Arena Focus" — desktop clock rail right of the board (opp clock / actions + requests /
  my clock); mobile opp bar / edge-to-edge board / my bar / action bar. Formalized as
  [B216](../../docs/todo/B216-room-arena-redesign.md).
