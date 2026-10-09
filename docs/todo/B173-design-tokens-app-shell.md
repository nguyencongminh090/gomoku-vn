# B173 — Design tokens (skin-swappable) + shared app shell
**Status:** OPEN
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
`docs/knowledge/ui-ux/` (ux-design-systems, fe-css-architecture); planning Q9 still open on skin persistence — resolve at pickup.

## Done when
- Lobby + room render in Arena dark and light; `node scripts/cache-bust.js` one value; `npm test` green; real-browser pass desktop + mobile.
