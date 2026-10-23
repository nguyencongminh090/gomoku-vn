# #330 Rankings phone table
**Cause:** 7 nowrap columns inside `.ptbl-wrap{overflow-x:auto}` → sideways scroll at 360px.
**Fix:** `ptbl__region/delta/club/games` hidden ≤640px under `#rk-wrap`; name cell wraps; top-3 rows get `rk-top--1..3` (tint + bar). Top-3 also on desktop.
**Test:** rankings-page.test.js (hide classes, top-3 marks, CSS media rule). Browser: 360px scrollWidth 336 = clientWidth 336; 1100px unchanged + highlight.
