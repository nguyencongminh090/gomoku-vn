# B326 — Room board cannot be played with the keyboard
**Status:** FIXED 2026-10-23 (e2e pass; audit Scenario 5 re-run pending)
**Area:** client/js/board.js:~376 (svg `role="img"`), client/js/game-ui.js (move emit), client/css (focus ring)
**From:** ux-audit room.html, 2026-10-23 (`docs/audits/ux-audit-2026-10-23-room.md` M1)   **Depends:** —

## Problem
`#board-area svg` has `role="img"`, `aria-label="17×17"`, no `tabindex`. A Tab walk (dock toggle → tabs → chat → 4 actions → nav) never reaches the board, so keyboard-only users cannot place a stone.
## Scope
1. Decide the pattern first (size S design): single focus stop on the board + arrow keys move a cursor, Enter/Space places; Esc leaves. Cite `docs/knowledge/ui-ux/INDEX.md` a11y note.
2. Visible cursor/focus ring on the cell; announce position + legality (live region, `A1`..`Q17` labels as drawn).
3. Reuse the existing click path so blocked/opening-zone rules and optimistic-stone logic stay in one place.
4. jsdom tests (key → same emit as click) + real-browser pass.
## Don't
- Don't fork move validation into the key handler.
- Don't touch board geometry/stone rendering.
## Traps
- Opening phase (3CR blocked stones/green zones) uses clicks too; the key path must cover it.
- Role must change from `img` (e.g. `application`/`grid`) or screen readers still announce a picture.
## Why this way
Roving cursor on one tab stop beats 289 tab stops; rejected: transparent buttons per cell (DOM bloat). Knowledge: `docs/knowledge/ui-ux/INDEX.md`.
## Done when
- Keyboard-only: sit, start, place a stone, see it on both clients.
- `npm test` green, cache-bust OK, audit re-run Scenario 5 on room.html.
