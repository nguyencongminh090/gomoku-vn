# B374 — Rankings page redesign RK17: podium inside LED split-flap board + 5 s opening
**Status:** OPEN
**Area:** client/rankings.html, client/js/rankings.js, client/css/rankings.css (new), client/js/i18n.js, client/tests/rankings-page.test.js, DESIGN.md
**From:** user 2026-11-14 "RK1 + RK4 + motions/animation on loading (animation 5s)" → mockup features/rankings-redesign/mockups/rk17-podium-board.html   **Depends:** —

## Problem
Rankings is a plain 7-col table: boring, top 3 not prominent, no story (features/rankings-redesign/planning.md).
## Scope
1. LED "arena" with own tokens that follow Light/Dark (dark = night LED, light = cream board; user 2026-11-14): podium for rank 1–3 (gold/silver/bronze steps, crown) above the table; table rows = rank ≥ 4 (all rows when searching).
2. Ratings as split-flap digits (visual, aria-hidden) + visually-hidden real number; provisional `?` kept.
3. Ticker "LÊN/XUỐNG · NAME ±d" from the page's top-8 |delta7| (aria-hidden; hidden when none).
4. "Your rank" becomes a dock fixed to the bottom (above the mobile tab bar); not-ranked text stays.
5. 5 s opening on first render: board on → rows cascade with rolling digits → steps 3/2/1 rise → podium digits settle → crown → dock. 1×/session (sessionStorage `rk-intro`), skip on "Bỏ qua"/pointer/wheel/key/touch, none under prefers-reduced-motion; each single motion ≤ 420 ms; transform/opacity only. Later tab/page switches render instantly.
## Don't
- No server change (no neighbour/"points to next rank" API, no tier thresholds).
- Don't delay data: DOM holds final values from t=0; the intro is decoration only.
- Avatars only via PlatformShell.avatar.
## Traps
- Phone (≤640px) must keep # · name · rating without sideways scroll (#330).
- Dock must sit above `.ptabbar` (--ptabbar-h) and not cover the pager (main padding).
- Ranks are per-scope positions (offset+i+1), so podium = rows with rank ≤ 3 when no `q`.
## Why this way
User pick after 3 mockup rounds (RK1 podium + RK4 split-flap + load motion). Long sequence vs. task page → skip/once/reduced-motion mitigations (fe-web-animation, vstyle-motion-immersive "Keep it usable").
## Done when
- jsdom tests (podium/table split, search → no podium, digits + sr text, ticker, dock, intro skip/once/reduced-motion) + npm test green; cache-bust OK; real-browser pass desktop + 375 px, dark + light.
