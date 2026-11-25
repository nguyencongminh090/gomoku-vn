# 2026-11-25 14:35 — #464 Tournament sub-tabs wrapped to 2 lines on mobile
## Prompt
"in team-standings-mobile.png at 390 px, 'Cặp đấu', 'Bảng xếp hạng' and 'Lịch sử ván đấu' each wrap to 2 lines … fix it in tournament.css (.sub-tabs / .sub-tabs__btn) only."
## Root cause
`.sub-tabs` is a flex row; buttons had default `flex-shrink: 1` + normal white-space and a 20 px
`margin-right` each, so at ~366 px of content the items shrank and the label text broke.
## Fix
`client/css/tournament.css`: `.sub-tabs__btn` `flex: none; white-space: nowrap`, last button no
right margin, ≤ 480 px margin 8 px; `.sub-tabs` `overflow-x: auto` (hidden scrollbar) so a strip
wider than the screen (320 px, large font scale) scrolls inside itself, never the page
+ `.sub-tabs__btn:focus-visible { outline-offset: -2px !important }` so the
global 2 px-outside focus ring (main.css, !important) is not clipped by the scroll strip
(docs/knowledge/ui-ux/vbase-layout-spacing.md: no page horizontal scroll at 320 px; iconography.md:
tabs keep visible text labels). Nothing else restyled. `cache-bust --write` (tournament.html,
tournament-match.html). Branch `fix/tournament-subtabs-mobile` off dev.
## Verification
New `client/tests/tournament-subtabs-css.test.js` (3 tests; red without the CSS); focus ring checked in Chromium (offset −2px, fully visible). Real browser
`browser.cjs team` (temp DB): mobile 390 px tabs on one line (team-standings/boards-mobile.png);
desktop shots byte-identical. Real DB md5 unchanged. Real page, finished event (verify.cjs e2e2): 320 px strip 318/296 → scrolls inside, page 320/320;
390 px + --fs-scale 1.3 strip 394/366 scrolls; 320 + 1.3 too; every label 1 line, buttons 40 px
(local shots features/club-platform/screenshots/verify/e2e2-subtabs-*.png). Not checked: real 200 % browser zoom.
