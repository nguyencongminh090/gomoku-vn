# Fix log entry — 2026-08-13 15:39

## Prompt

Series of user reports/requests on `ui/zen-minimal` (Zen Panel Drawer room
layout), all via screenshot + short text, iterating on the already-implemented
zen room screen:

1. "Chatbox: No border / Align board position" (chat input had a visible
   border/ring; board looked misaligned).
2. "chatbox stills has border now? remove border on active" — the box-shadow
   fix wasn't the whole story.
3. "Board align looks no change?" — followed by a DevTools screenshot showing
   the board's actual box model.
4. "825x875 is not square?" — user caught that the reported box-model numbers
   proved a real bug, after an earlier reply from this session had wrongly
   dismissed the visual as a DevTools highlight artifact.
5. "What about no padding for board?" / "I mean fit the board size with
   height." / "Fit `board-area` height with `board-area-shell` height. You can
   even zoom the board" — push to maximize board size, removing reserved
   whitespace.
6. "The is stills a gap at bottom / 883 vs 935 -> gap 52px" — final residual
   gap traced to the pre-game `.game-controls` reservation.

## Action

Worked through the reports as separable, layered causes rather than one bug,
per this repo's own "root-cause diagnosis" convention (check the layer below
the visible symptom):

- **Chat box-shadow ring**: `room.css`'s `.chat-input input:focus` box-shadow
  wasn't reset by the zen override — added `box-shadow: none` to the combined
  focus rule.
- **Chat border surviving that fix**: root cause was unrelated to
  border/box-shadow — `main.css`'s global `:focus-visible` outline
  (`!important`) resolves to solid ink under zen's token overrides. Fixed with
  a scoped, equally-`!important` override, deliberately keeping the wrapper's
  `:focus-within` hairline as the replacement focus indicator (not deleting
  the a11y signal outright).
- **"Board misaligned" — first false lead**: initially concluded the "gray
  box" the user saw was just a DevTools highlight overlay, based on an
  isolated Playwright test showing correct box-model numbers, and asked for a
  cleaner screenshot. The user corrected this by pointing out the actual
  numbers (825×875) proved the frame genuinely wasn't square — an important
  course-correction logged here so the same dismissal isn't repeated.
- **825×875 non-square frame**: root cause was a single hairline border on
  `.board-area` wrapping both the square canvas AND the turn-bar/game-controls
  rows below it. Fixed by moving the border specifically to
  `.board-canvas-wrap` (the one element that's always exactly square) and
  removing it from `.board-area`/`.board-area-inner`.
- **Oversized legacy space reservation**: `board.js`'s `resize()` still
  subtracted the old non-zen "Double-Bezel" card design's thick
  padding/border (`-14-16-12-8`) even though zen's `.board-area` is now flat
  and borderless — replaced with a zen-specific branch using the real,
  accurate overhead (`canvasWrapBorder=2`, conditional `turnBarMargin`,
  conditional `controlsMargin`).
- **Shrink-wrap leaving a residual gap vs. shell height**: `.board-area`'s
  `flex:0 0 auto` shrink-wrap couldn't reliably match `board.js`'s
  approximated size, leaving slack. Made `.board-area`/`.board-area-inner`
  explicit `height:100%` of the shell (safe since the shell has a definite
  height on desktop; mobile gets its own `height:auto` override so the same
  fix doesn't loop back into circular percentage sizing there, matching the
  existing `.room--focus .board-area-inner` `width:auto;height:auto` pattern
  as precedent for this class of fix).
- **Final 52px gap**: traced exactly to `.game-controls`'s pre-game
  reservation (2px canvas-wrap border + 40px `min-height` + 10px
  `margin-top`, still live-measured by `board.js` even though the div was
  empty pre-game). Fixed with `.game-controls:empty { min-height:0;
  margin-top:0; }`, `board.js`'s `controlsMargin` made conditional on
  `gcH > 0`, and `game-ui.js`'s `renderGameControls()`/`renderSwap2()` firing
  `boardRenderer.resize()` (via `requestAnimationFrame`) the moment real
  controls actually render, mirroring the existing `setTurnBarVisible()`
  pattern.

Verified throughout with a self-built, repo-external Playwright harness
(`board-fit-test.html`, loading the real `BoardRenderer` class from
`client/js/board.js` against the actual repo CSS via `file://` URLs) rather
than a screenshot-guess-fix loop — this is what caught the DevTools-artifact
misdiagnosis and let each fix be verified with exact before/after pixel
numbers instead of visual inspection alone. Final end-to-end verification
used two real guest sessions via Playwright against isolated
worktree/copy + throwaway server + throwaway DB (never the user's real
port-3000 server/DB), confirming pre-game board fills the shell
(1018/1020px, only the 2px hairline left over) and correctly shrinks to
968px the instant real controls render.

## Decision

Kept the fix scoped to `body.zen-room`-prefixed rules only (no change to the
non-zen room skin's `.board-area`/`.ready-dot`/etc.), and kept the
`:focus-within` hairline as chat input's focus indicator rather than removing
focus feedback outright when suppressing the global `:focus-visible` outline.
`npm test`: 1131/1131 (server-side suite unaffected — this is a client-only
CSS/JS layout fix with no `server/` changes).

## Summary output

- `client/css/room-zen.css`: `.board-area`/`.board-area-inner` borderless,
  `height:100%` of shell (with mobile `height:auto` override); hairline
  border relocated to `.board-canvas-wrap`; `.game-controls:empty` collapse;
  `#chat-input-wrapper` box-shadow/border/`:focus-visible` fixes;
  `--zen-board-gutter` reduced to 0.
- `client/js/board.js`: `resize()` zen-specific overhead branch
  (`canvasWrapBorder`, conditional `turnBarMargin`/`controlsMargin`) replacing
  the inherited non-zen flat subtraction.
- `client/js/game-ui.js`: `renderGameControls()`/`renderSwap2()` now trigger
  `boardRenderer.resize()` on content change.
- `client/js/room.js`: mobile drawer no longer force-collapses on load;
  `refitBoardAfterDrawer()` re-measures the board while the drawer's
  `padding-right` transition animates.
- `client/js/room-socket.js`: auto-collapse the zen mobile bottom sheet on
  `game:init` so the board gets priority once play starts.
- Committed on `ui/zen-minimal` (`63e04e6`, alongside the separately-tracked
  Slot Status #113 work merged from `dev` in the same push) — not yet on
  `main`/`dev`, per the `ui/*` branch convention (merges only once a design
  direction is chosen).
