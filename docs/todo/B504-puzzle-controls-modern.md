# B504 — Redesign Puzzle pages controls to Modern style
**Status:** OPEN
**Area:** client/css/puzzles.css, client/puzzles.html, client/puzzle.html, client/puzzles-mine.html, client/puzzle-editor.html, client/js/puzzles.js, client/js/puzzle.js, client/js/puzzles-mine.js, client/js/puzzle-editor.js, client/tests/puzzle-solve-page.test.js, client/tests/puzzle-authoring-pages.test.js
**From:** features/puzzle-modern (planning.md, user_story.md), 2026-11-27   **Depends:** —

## Problem
The four Puzzle pages (`/puzzles`, `/puzzle/<id>`, `/puzzles/mine`, `/puzzles/new`) still use classic `.pbtn`/`.pchip`/`.ptab` controls (5 px corners, opacity hover, flat ghost boxes, solid brand filter/tool chips competing with the CTA) instead of the Modern Flat 2.0 widget language from `/replay/<id>` (`replay.css`, #502).

## Scope
1. Branch `ui/puzzle-modern` off `dev`. Scope page tokens and control classes under `body.pz-page` in `puzzles.css` (`--pz-r: 10px`, `--pz-r-lg: 14px`, `--pz-ease`, `--pz-ring`, `--pz-elev` matching `replay.css`).
2. Replace every classic `.pbtn`/`.pchip`/`.ptab`/`.pback` on the 4 pages per the approved mapping: 1 raised brand primary per active view, tonal pills for secondary actions, danger tonal pills for destructive actions (`#pz-clear`, puzzle delete, answer trash), quiet pills for back/nav/cancel/pagers, pill segmented controls for single-select tabs/filters/tools, and tonal toggle pills for multi-select editor tags.
3. Preserve all IDs, `data-i18n` keys, ARIA states, form submission, and JS hooks (visual-only).
4. Run `node scripts/cache-bust.js --write` + verify `OK`; update affected client jsdom tests and run `npm test`.
5. Real-browser pass on an isolated temp DB (`playwright-e2e-safety`) across dark/light and desktop/phone (`≤ 860 px`), 0 console errors, ≥ 3:1 boundaries, ≥ 4.5:1 text, ≥ 44 px touch targets, `:focus-visible` ring, no motion under `prefers-reduced-motion`, and side-by-side before/after shots in `features/puzzle-modern/shots/`.

## Don't
- Change `.pbtn` in `platform.css` (social, club, settings, forum, admin depend on it) or promote shared tokens yet (#505).
- Touch `server/`, `client/js/board.js`, `client/css/game.css`, or `/admin#puzzles` (`admin.html`).

## Traps
- `admin.html`, `forum.html`, and `forum-thread.html` load `puzzles.css` — scope rules to `.pz-page` / `.pz-*` so they never leak.
- Light `--c-surface-2` (`#f4f3f0` on `.prows--tickets` in `/puzzles/mine`) drops raw `--c-error-bg` text contrast to 4.49:1; mix tonal fills over `--c-surface` and give tonal/quiet/segmented controls ≥ 3:1 semantic borders.

## Why this way
Page-scoped `--pz-*` tokens mirror `replay.css` (#502) 1:1 while keeping `platform.css` stable. Notes: `docs/knowledge/ui-ux/vbase-depth-motion.md`, `docs/knowledge/ui-ux/vbase-visual-principles.md`, `docs/knowledge/ui-ux/a11y-wcag-essentials.md`, `docs/knowledge/ui-ux/ux-responsive-mobile-first.md`.

## Done when
- Zero classic `.pbtn` look on the 4 pages; 1 raised primary per view; `cache-bust` OK; `npm test` green; isolated browser pass + side-by-side before/after shots with 0 console errors.

## Verification (2026-11-27, on `ui/puzzle-modern`, awaiting merge approval)
- `node scripts/cache-bust.js`: OK; `npm test`: 300/300 suites, 5366/5366 tests green.
- Isolated temp-DB Playwright pass (`features/puzzle-modern/shoot.js --after`, `gomoku.db` sha256 unchanged): 16/16 views (`puzzles`, `puzzle`, `puzzles-mine`, `puzzle-editor` × desktop `1366×900` / phone `390×844` × dark / light) show `pbtn=0`, 1 raised primary, `contrastErr=0` (≥ 3:1 boundaries, ≥ 4.5:1 text), `<44px=0` on phone, `:focus-visible` ring OK, `prefers-reduced-motion` `0s` transitions, `0` console errors.
