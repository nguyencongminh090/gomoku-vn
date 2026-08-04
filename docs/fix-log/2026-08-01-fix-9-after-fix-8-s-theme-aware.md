# Fix log entry — 2026-08-01 22:30

## Prompt

Fix #9: after Fix #8's theme-aware repaint, the user asked to try a different board palette entirely — pointed at a warm tan/wood-and-brick reference screenshot (parchment background, brown grid, red-brick wall tiles) rather than the cool-teal set Fix #8 kept.

## Action

Changed the four `--board-*` tokens from Fix #8 in both theme blocks of [client/css/main.css](client/css/main.css): light `--board-bg` → `#EFDFC0` (warm parchment), `--board-accent-rgb` → `92, 71, 43` (dark umber, was teal-800), `--board-ink-rgb` → `43, 31, 20` (warm espresso, was slate-900); dark `--board-bg` → `#2A1F14` (deep walnut), `--board-accent-rgb` → `196, 154, 91` (warm tan/gold, was teal-400), `--board-ink-rgb` → `240, 225, 200` (warm cream, was slate-100). `--board-pending-rgb` (hover/pending-move green) was left unchanged — it's a functional feedback color, not part of the board material. Also swapped the `BLOCK_MORTAR`/`BLOCK_DARK`/`BLOCK_BASE`/`BLOCK_LIGHT` constants inside `_drawWall()` in [client/js/board.js](client/js/board.js) from the cool-gray palette to a warm brick-red one (`#5C3A28`/`#8B4A32`/`#B85C3D`/`#D97F53`) to match the reference's brick tiles. No structural code changed — this reused the theming plumbing (`_readBoardTheme()`, the `data-theme` `MutationObserver`) Fix #8 already built, so the palette swap is CSS-token-only outside of the wall constants.

## Decision

Kept the black-ink X / red-outline O piece colors from Fix #8 rather than matching the reference's black-on-black O, because shape (X vs. O) plus color is the existing differentiation signal and collapsing both pieces to the same ink tone would reduce it to shape-only. Re-ran the WCAG contrast check from Fix #8 against the new tones since a material swap can silently break contrast: the first-pass warm accent (`139, 111, 71`) only reached ~2.86:1 for coordinate labels against the new, notably darker parchment background (0.75 relative luminance vs. the old 0.94) — below the 4.5:1 text target — so it was darkened to `92, 71, 43` before shipping, restoring ~4.72:1 (light) / the dark-theme accent `196, 154, 91` measured ~4.89:1 unchanged.

## Summary output

Re-ran the same Playwright harness from Fix #8 (fake board state, now including two wall tiles) against both themes. Light: parchment background, dark-umber grid/border/coordinates/star points/highlights, brick-red wall tiles, black X / red O pieces — all legible, no regression in wall geometry (brick pattern, corner radii, stagger) since only the four fill colors changed. Dark: deep-walnut background, warm-tan grid/labels, same warm brick tiles, white-ink X for visibility against the dark bed. `data-theme` toggle still repaints live via the existing `MutationObserver`. Computed WCAG contrast (relative-luminance formula, alpha-composited over the board background): light theme — bg vs. black-piece ink 12.2:1, bg vs. coordinate label 4.72:1, bg vs. star point 2.76:1; dark theme — bg vs. black-piece ink 12.5:1, bg vs. coordinate label 4.89:1. All text-bearing values clear WCAG AA 4.5:1 in both themes. Screenshots: [docs/screenshots/fix9-board-warm-light.png](docs/screenshots/fix9-board-warm-light.png), [docs/screenshots/fix9-board-warm-dark.png](docs/screenshots/fix9-board-warm-dark.png).
