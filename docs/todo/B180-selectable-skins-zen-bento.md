# B180 — Selectable skins (A Zen, D Bento)
**Status:** OPEN
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
