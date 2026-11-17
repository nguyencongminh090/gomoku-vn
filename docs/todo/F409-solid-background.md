# F409 — Solid page background (drop grid + leaves)
**Status:** BUILT 2026-11-17 on ui/solid-bg (uncommitted): 4225 jest pass, ?v= OK, screenshots rankings+home light/dark desktop; no phone/other-skin pass. Leaves SVGs kept (mockups use them).
**Area:** client/css/platform.css (grid+leaves block ~L10-35), client/css/tokens.css (--c-bg, --c-surface, --c-bg-grid*, --bg-leaf-*), lobby-zen.css, rooms-hall.css
**From:** user 2026-11-17: "Trắng tinh / đen dịu" chosen from `client/bg-solid-mockup.html` (also compared: `client/bg-options-mockup.html`, 13 options incl. wood photos in `client/assets/stock-wood/`). **Depends:** —

## Problem
Page paper (48/12px grid + corner leaves, #282) replaced by a flat colour; user wants to try a plain background.

## Scope
1. Light `--c-bg` #ecebe8 -> #fafaf8; surface stays #ffffff. Dark `--c-bg` #161512 -> #121212 (Material dark baseline), `--c-surface` #262421 -> #1e1e1e, `--c-surface-2` re-derived.
2. Remove grid + leaves layers (`body::before/::after`, `body.pl`, `body.zen-lobby`, green-leaves dark variant) and their tokens; delete unused `assets/patterns/leaves*.svg`.
3. Card separation: light surface/bg is only ~1.04:1 -> add 1px border `--edge` and/or soft shadow on `.pcard`-class cards; check every platform.css page.

## Don't
- Don't touch the board/stones colours or `diag`/room clock files.
- Don't pick other candidates (wood, cream, slate...): user chose this one.

## Traps
- Light #fafaf8 vs #fff cards nearly merge: verify with screenshots before calling it done.
- Warm-grey tokens (#ecebe8, #262421) are referenced by hard-coded rgba in some CSS; grep before changing.
- `?v=` must be re-run: `node scripts/cache-bust.js --write`. Mockup colours were tested with hypothetical board colour #d9b377, not the real board: recheck stone/board contrast.
- Pages not loading platform.css (login, tournament, history) have their own bg: decide per page.

## Why this way
Cheapest option (0 KB, 0 repaints), lets board and stones stand out; chosen by the user over 12 other options.

## Done when
- Light + dark, every platform page and lobby, desktop + 390px, screenshots checked; contrast >= 4.5:1 text.
- jest green, ?v= OK, fix-log entry.
