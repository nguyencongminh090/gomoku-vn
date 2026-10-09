# B173 — Design tokens (skin-swappable) + shared app shell
**Status:** ✅ DONE 2026-10-09 (branch `ui/arena-tokens`, not yet merged to dev — awaiting user review) — Arena dark+light tokens, shell on lobby+room, colour-mode switch in Settings. Not done: Arena top bar on history/tournament pages (#179), skins A/D (#180), tool-measured contrast, `ux-audit`.
**Area:** client/css, client/*.html, client/js/settings-panel.js, client/js/session.js
**From:** features/platform, B172 outcome 2026-10-09   **Depends:** — (B172 done)

## Problem
Pages share no design system; platform needs one look. Decided: default skin **C Arena**, modes dark (default) + light; A Zen / D Bento selectable later via Settings; B dropped.

## Scope
1. Token layer from `client/platform-arena-mockup.html` vars (colour, radius, type, density); `data-skin` + `data-mode` on `<html>`, `@layer`; board/stone tokens separate (board design stays locked).
2. Shared nav/app shell + core components (button, chip, tab, card, table, avatar, badge, form field) per the mockup; mobile bottom tab bar.
3. Apply to lobby + room first; migrate remaining pages one by one.
4. Persist mode (and skin) cookie-first so the server can emit `data-*` without a flash (CSP-safe); settings toggle for mode. Skins A/D = later todo.

## Don't
- No backend schema work (`users.ui_skin` belongs with profile B177); no ranking/profile/club pages.
- Don't touch `board.js` / board rules in `game.css`; don't build A/D skins yet.
- Bump `?v=N` everywhere (rules/cache-busting.md); clock work → diagnostic-page-sync rule if room UI touches it.

## Why this way
`docs/knowledge/ui-ux/` (ux-design-systems, fe-css-architecture); planning Q9 resolved 2026-10-09: skin = colour+radius tokens only; cookie-first persistence (server sets `data-skin`/`data-mode`); default dark; single shared board, contrast-checked per skin.

## Done when
- Lobby + room render in Arena dark and light; `node scripts/cache-bust.js` one value; `npm test` green; real-browser pass desktop + mobile.

## Evidence (2026-10-09)
- New: `css/tokens.css` (dark default, `[data-mode=light]`), `css/shell.css`, `js/skin-preload.js`; `ui-mode.js` get/setColorMode (cookie `gvn_mode` + localStorage); Settings "Chế độ màu" row; zen token blocks removed from lobby-zen/room-zen; login.css own palette removed.
- Tests: `client/tests/color-mode.test.js` (preload, setColorMode, settings row); `npm test` 91 suites / 1870 green; `?v=172` single value.
- Real browser (Chrome, fresh throwaway DB, real DB restored + checksum-verified): login/lobby/room/history/tournament in dark+light, desktop+mobile, no console errors, mode survives reload.
- Deviation from todo step 4: no server-emitted `data-*` — the blocking `skin-preload.js` reads the cookie before paint (same pattern as ui-mode-preload; no HTML templating exists).
- Reverses #160 (Dark UI removed 2026-08-28) on explicit user request 2026-10-09; `settings-panel-no-theme-row.test.js` still passes (new keys are `gset.color_mode`, not `gset.theme*`).
