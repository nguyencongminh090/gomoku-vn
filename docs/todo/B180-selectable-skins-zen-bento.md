# B180 — Selectable skins (A Zen, D Bento)
**Status:** ✅ DONE 2026-10-09 (branch `feature/180-skins`, uncommitted) — zen+bento token blocks (dark+light, colour+radius only) in tokens.css; `setSkin/getSkin/applySavedSkin` in ui-mode.js; cookie `gvn_skin` + preload; Settings → Theme segment; `users.ui_skin` + `PUT /api/profile {uiSkin}` + `GET /api/profile/prefs`; ?v=181. Tests: client/tests/skin-contrast.test.js, skin-select.test.js, server/tests/profile-route.test.js. NOT done: real-browser look at lobby/room under zen/bento (contrast is machine-checked, appearance is not).
**Area:** client/css/tokens.css (+ per-skin token blocks), settings-panel.js
**From:** planning Q9 / user 2026-10-09 "multiple UI: A C D"   **Depends:** B173 (B177 for DB persistence)

## Problem
Tokens are skin-swappable (`data-skin`) but only `arena` exists; Settings has no skin picker.

## Scope
1. `:root[data-skin=zen|bento]` token blocks (colour + radius only) from the mockups; both modes.
2. Skin segment in Settings; cookie `gvn_skin` + preload; `users.ui_skin` sync with B177.
3. Contrast-check every skin × mode against the shared board.

## Don't
- Density/layout differences; board restyle.

## Done when
- Switching skin/mode live changes lobby+room; tests for preload + setter; real-browser pass.

## Outcome
- Contrast: every skin×mode passes AA (4.5:1 text, 3:1 state dots) on ink/ink-2/ink-3/brand/accent/status tokens vs bg/surface/field. Fixed one pre-existing gap: Arena dark `--c-accent` #d85000 (3.7:1) → #ee6a20 (4.95:1); it is only used as text/border colour. Board tokens untouched (tested: no skin block defines board/stone vars).
- Settings only exists in the lobby (needs `session.js`); pages without it (history, rankings, profile, clubs) just follow the stored skin. Fresh device + signed-in member adopts `users.ui_skin` once (no echo PUT). Cookie stays authoritative per device.
- Known unrelated trap: `settings-panel.js` calls `GvnSession.getUser()` and would throw on pages that don't load `session.js` if its button were ever injected there.
