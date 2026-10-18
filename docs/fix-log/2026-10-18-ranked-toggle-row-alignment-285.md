# #285 — Disabled ranked toggle row: switch misaligned
**Root cause:** `.toggle-switch` (44px) was a shrinkable flex item; the wrapping `<small>` hint in `.toggle-name` squeezed it, shifting its right edge ~8px.
**Fix:** `lobby.css` — `.toggle-name{flex:1;min-width:0}`, `.toggle-switch{flex:none}`. Shared rule, so create-room modal toggles get the same guard. Hint copy untouched.
**Test:** `client/tests/toggle-row-alignment.test.js` (CSS-rule assertion). ?v= bumped.
**Unverified:** real-browser screenshot at 340px rail with guest seated (jsdom has no layout).
