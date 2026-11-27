# Replay page redesign — user stories

Links: [planning](planning.md) · [state](diagram/state.md) · [sequence](diagram/uml_diagram/sequence.md) · mockups in [mockups/](mockups/) · shots in [shots/](shots/)

Page: `/replay/<id>` (`client/replay.html`, `client/js/replay.js`, `client/js/replay-report.js`). Client only.

## Actors
- **Player**: reviews their own game, often from the profile history or right after a game.
- **Viewer / spectator**: opens a shared link, sometimes to one specific move.
- **Tournament viewer**: opens `?source=tournament` from a tournament page.
- **Member reporter**: a logged-in member who reports cheating in a casual game.

## Stories
1. As a player I see the board as large as the screen allows, with no page scroll on desktop.
2. As a player I see every move in a list, click one to jump there, and the current move is highlighted.
3. As a player I scrub with a timeline slider and pick an autoplay speed (0.5×, 1×, 2×; 1× = today's 600 ms).
4. As a player I see how long each move took and the game's total duration, when the game stores timestamps.
5. ~~Winning-five highlight~~: dropped (2026-11-27), the winning rule is not stored (#501).
6. As a viewer I copy a link to the game or to the current move, and opening it lands on that move.
7. As a phone user I see the board across the full width with the playback controls under it, without scrolling. The move list is visible or one tap away.
8. As an analyst I add variations by clicking the board, see them in the move list, and delete a branch.

## Rules that must survive (keep_working)
- `?source=tournament` loads `/api/tournament-games/:id`. "Back" goes to `tournament.html?id=…`.
- Cheat report: casual games only, logged-in non-guest members only (`replay-report.js`).
- The analysis-mode preference is remembered (`gvn_replay_analysis`). Clicking the board adds a variation. Delete removes the branch.
- Keys: ←/→, Home, End, Space, Escape (back), A (analysis), Delete (branch). Ignored while typing in an input.
- vi/en through `data-i18n`, with a re-render on `langchange`.
- `PlatformShell.build('learn')`, the Phosphor sprite, dark/light mode and every UI skin.

## Hard constraints
- No `server/` changes. `client/js/board.js` and the board rules in `game.css` stay untouched. The board grows through the layout around it.
- No engine eval, eval bar, move-quality labels or placeholders for them.
- Data the payload lacks (avatar, rating, the winning rule) is left out and recorded as a todo (#500, #501).
- Icons are Phosphor Regular only (`docs/knowledge/ui-ux/iconography.md`). The sprite gains skip-back, skip-forward, pause, link and git-branch.
