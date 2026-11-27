# F508 — Puzzle area redesign: concept C "Training path"
**Status:** ✅ DONE 2026-11-27 — commit 08290c1b, merged to dev (90c12af9)
**Area:** client/puzzles.html, puzzle.html, puzzles-mine.html, puzzle-editor.html, client/css/puzzles.css, client/js/puzzles*.js, puzzle*.js, i18n.js
**From:** features/puzzle-modern/prompt.md task 1   **Depends:** B504, F506, F507 (same branch `ui/puzzle-modern`, uncommitted)

## Scope
Implement mockup `features/puzzle-modern/mockups/c.html` (+ shared `mock.css` widget system) on the four real pages:
- /puzzles: hero "continue", one shelf per level with progress, horizontal cards.
- /puzzle/<id>: panel as 3 steps — read → answer (text input, F507) → explore (after solve / 0 tries).
- /puzzles/mine: "needs action" first, then active strip.
- /puzzles/new: board + step tabs in the inspector (Auto/wall/portal/erase/answer tools from F506).
Widget states: hover, focus-visible, disabled, pressed; tokenized motion + reduced-motion fallback; stacked < 860 px, board first.

## Don't
- Touch board.js internals, game.css, platform.css `.pbtn`, admin.html; extend BoardRenderer via options only.
- Drop any ID, data-i18n key, ARIA state or JS hook (except those F506/F507 removed). No "A · B · C" joins.

## Traps
- **Resolved 2026-11-27 (user's call): (a) small read-only server change** — `GET /api/puzzles/progress`, `position` on GET /:id, `counts` on /mine. Overrides prompt.md / design-workflow `server/` lock for this item only.
- Mockup copy is placeholder: map every element to real data in client/js before copying wording.
- Restructure DOM to match the mockup, not a token re-skin (design-workflow Stage 4).

## Verification
npm test; cache-bust OK; `LABEL=after node features/puzzle-modern/shoot.js` on a temp DB (GOMOKU_DB_PATH) → after shots, 0 console errors, contrast ≥ 4.5, targets ≥ 44 px, focus ring, no motion under reduce.

## Result (2026-11-27)
- Server (read-only): `GET /api/puzzles/progress`, `position {index,total,nextId}` on GET /:id (list order), `counts` on /mine. Tests: `server/tests/puzzles-progress.test.js`.
- Client: 4 pages rebuilt to mockup C; IDs kept; `pz-tag` chips (no " · "); editor tabs = ARIA tabs + `novalidate` (missing title → details tab). Dot class `pz-dot` (not `pz-stone--`, #506 guard).
- Changed on purpose: list with no level = 4 shelves (5 fetches), pager only in one-level view; 2 old list tests + 2 #504 tests updated.
- Shots: `features/puzzle-modern/shots/{before,after}-*` + `*-measure.json` (0 contrast/target/console issues, 16 views).
