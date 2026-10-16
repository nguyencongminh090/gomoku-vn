# B261 — Lobby layout shift (CLS 0.24 desktop / 0.85 mobile): reserve space for the JS-built shell
**Status:** OPEN
**Area:** `client/index.html` (`#pl-shell`), `client/css/platform-shell.css`, `client/js/platform-shell.js`, lobby `.ppanel` CSS
**From:** perf analysis 2026-10-16 (Playwright, isolated server :3999)   **Depends:** —

## Problem
`client/index.html:54` ships an empty `<div id="pl-shell"></div>`; `platform-shell.js` fills a 56 px nav after first paint,
so `.lobby-layout` jumps y0→56 at ~100 ms. Mobile also shifts `.ppanel` (h412→634, y147→210).
Measured CLS: desktop 0.235, mobile 0.848 (good ≤ 0.1). `profile.html` measured 0 — compare how it differs.

## Scope
1. Reserve the shell height before JS runs (CSS `min-height` on `#pl-shell`, or server/static markup); no CSS exists for it today.
2. Find what resizes `.ppanel` on mobile (async content / skeleton missing) and reserve its height.
3. Re-measure CLS on lobby (1280 + 390 widths); also check clubs/rankings/profile, which share the shell.

## Don't
- Don't change shell visuals or the 56 px height value; don't touch other pages unless they measure > 0.1.

## Traps
- A reserved height that differs from the real one just moves the shift; read the real height from the shell CSS.
- Touches `client/css|js|*.html` → bump `?v=N` everywhere (`node scripts/cache-bust.js`).

## Why this way
Placeholder height is the smallest fix for the cause measured. Rejected: render shell server-side (cross-layer, size L).
Knowledge: none.

## Done when
- Lobby CLS ≤ 0.1 at 1280 and 390 widths in a real-browser pass (numbers in fix-log).
- jsdom/`npm test` green; `?v=` one value.
