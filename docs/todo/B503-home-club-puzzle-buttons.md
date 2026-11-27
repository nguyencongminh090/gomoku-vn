# B503 — Surface Puzzle and Clubs entry buttons on Home (desktop + phone)
**Status:** ✅ DONE 2026-11-27 — `npm test` 5364/5364; cache-bust OK; real-browser pass (isolated DB, before/after, dark+light) at 1440/1024/390/360: 0 overflow, 0 overlap, 0 console errors; desktop pills 44px tall, phone pills 52px; phone Tab order Tạo phòng → Học → Hội nhóm; at 861px pills sit 35px clear of the chips.
**Area:** client/index.html, client/css/home-lamp.css, client/css/home-hero.css, client/tests/lobby-home.test.js, client/tests/home-lamp.test.js
**From:** user request 2026-11-27 (`ui/home-club-puzzle`)   **Depends:** —

## Problem
Home hides the existing `/puzzles` and `/clubs.html` anchors on both desktop (`home-lamp.css` `.hub-more` shows only `/forum`) and phone (`home-hero.css` hides `.hq-tiles`), leaving no direct Home entry buttons for Puzzle and Clubs.

## Scope
1. Branch `ui/home-club-puzzle` off `dev`.
2. Desktop (`≥861px`, `home-lamp.css`): un-hide `/puzzles` and `/clubs.html` alongside `/forum` in `.hub-more` as quiet lamp-palette pill buttons (`--hl-card`, `--hl-line`, `--hl-ink-2` → `--hl-ink`, `min-height: 44px`), keeping `#tournaments` hidden and staying clear of the lamp focal controls.
3. Phone (`≤860px`, `index.html` + `home-hero.css`): place existing `nav.hq-tiles` right after `#hh-create` in DOM order, un-hide `/puzzles` and `/clubs.html` as two equal-width secondary glass pill buttons matching `.hh-create` (`min-height: 52px`, `border-radius: 999px`, `--hh-on-photo` / `--hh-on-photo-2`), keeping `Chơi nhanh` as the sole primary CTA.
4. Run `node scripts/cache-bust.js --write` and verify `OK`; extend jsdom tests in `client/tests/` and run `npm test`.
5. Real-browser pass (isolated DB) at `1440×900`, `1024×768`, `390×844`, `360×740` (before/after screenshots, dark + light, focus order/rings, `>= 44px` targets, 0 overflow/overlap).

## Don't
- Add new colors, fonts, icons, i18n keys, duplicate anchors, or `A · B` middle-dot strings.
- Touch room list, tournament screens, `server/`, `board.js`, or commit/merge before user approval.

## Traps
- `shell.css` styles `.hq-tiles` as a 4-col surface card with `::before` dividers at `≤860px`; reset all of those on `#screen-home` in `home-hero.css`.
- Move `nav.hq-tiles` in DOM (not CSS `order`) so keyboard Tab order matches visual reading order above `#qm-line` guest login link.
- Reserve horizontal space on desktop `.hq-main` (`padding-right`) so `#home-chips` + `#qm-challenge` never collide with the wider 3-pill `.hub-more` near `861px`.

## Why this way
Reuses the existing `.hub-more` and `.hq-tiles` anchors (`shell.learn`, `lobby.clubs`) and each layout's own token set (`--hl-*` on desktop, `--hh-*` on phone). Notes: `docs/knowledge/ui-ux/iconography.md`, `docs/knowledge/ui-ux/a11y-aria-keyboard-focus.md`, `DESIGN.md`.

## Done when
- `node scripts/cache-bust.js` prints `OK`; `client/tests/lobby-home.test.js` + `home-lamp.test.js` + full `npm test` pass.
- Before/after screenshots and measurements pass at `1440×900`, `1024×768`, `390×844`, `360×740` in dark and light modes.
