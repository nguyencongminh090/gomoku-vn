# 2026-10-11 11:17 — #218 Room mobile: gap between tiles and chat bar grows after expand → scroll → minimize
## Prompt
User phone screenshots 10:57/10:58 (Samsung Internet, 360 CSS px): "Expand and minimize has blank space. Expect: responsive cover" — "ở UI bình thường khoảng cách chấp nhận được, nhưng khi expand, cuộn xuống và minimize lại, khoảng trống nhiều hơn trước". Expanded: chose "vừa khít màn hình".
## Root cause
Expanded panel (min 360px) made the *document* scroll → the browser auto-hid its address + bottom bars (~90px) → 100dvh grew →
`.room{min-height:100dvh-nav}` grew. After minimizing nothing is scrollable, so the bars never come back and the whole
~90px sat between the action tiles and the bar (22px → 112px on the user's phone). Browsers only hide bars on a document scroll.
## Fix
room-arena.css phone block: app shell — `html/body{overflow:hidden}`, `.room{height:calc(100dvh - nav); overflow-y:auto}` is the
only scroller; sticky tops now relative to .room (0 / pcard-h / pcard-h+board-h); `.room > *, .rail > *{flex-shrink:0}` (only the
panel flexes). Expanded panel fits the leftover (min-height 360 → 200px floor). Tiles padding 6→5px (minimized fits 360×645).
## Verification
- Tests: room-arena-mobile-sticky (app-shell guard replaces overflow-x:clip), room-panel-minimize (200px). Full npm test green. ?v=285.
- Real browser 360×645, 360×735, 390×844, 375×667, 320×568: document scroll 0 everywhere; gap tiles→bar identical before/after
  expand+scroll+minimize (0/88/162/4/20 px); expanded 390×844 fits exactly (panel 239px, no scroll); short phones scroll .room 103–125px
  with cards+board staying stuck.
- Not verified: real keyboard on Android/iOS with the document unscrollable (should pan the visual viewport); real Samsung Internet.
