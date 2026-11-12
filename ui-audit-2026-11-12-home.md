# UI audit
Target: client/index.html (home screen #screen-home), client/css/shell.css, client/js/i18n.js — live on an isolated server :3101 (guest, vi-VN), 320/375/768/1280/1440 px, light + dark
Baseline: vbase-only
Mode: with-screenshots
Counts: block 1, major 4, minor 4

Separate file on purpose: `ui-audit-2026-11-12.md` is the site-wide audit that `ui-fix-2026-11-12.md` already works from.
Screenshots: scratchpad `shots/home-{light,dark}-{320,375,768,1280,1440}.png`, `home-dark-375-qmmenu.png`.

| id | severity | location (file:line or region) | evidence | rule | note | suggested fix |
|---|---|---|---|---|---|---|
| F1 | block | client/css/shell.css:260 `.qm-line .rtag--rule` (light) | "Caro VN" tag: `#41701a` text on 18 % brand tint over `#ecebe8` = 3.98:1 at 14px/600 (needs 4.5). Dark is 7.27:1 | COL-CONTRAST-TEXT | vbase-color#Rules that must hold | darken the light `--c-brand-text` for this tag or drop the tint to ~10 % |
| F2 | major | region `#qm-line` (shell.css:244, i18n.js:1146 `qm.guest_casual_only`) | guest note "khách chỉ chơi giao hữu — đăng nhập để chơi xếp hạng" is 12px muted plain text; "đăng nhập" is not a link, no way to act on it from the home screen | DEP-CLICKABLE-SIGNIFIERS | vbase-depth-motion#Signifiers (the key rule) | make "đăng nhập" a real link to login/register |
| F3 | major | region `#qm-line` tags "Caro VN", "Tự động" (shell.css:258-260) | spans styled as rounded filled chips, same shape as the tappable chips in the open `#qm-menu` (44px buttons); tapping them does nothing | DEP-CLICKABLE-SIGNIFIERS | vbase-depth-motion#Signifiers (the key rule) | either make them open `#qm-menu`, or render as plain text ("Caro VN · Tự động") |
| F4 | major | index.html:118-123 `.hub-more`, shell.css:345-349 | 4 icon-only circles (target, chat, trophy, users); label only in `aria-label`/`title`, invisible on touch; trophy duplicates the "Giải" tab right below | FLW-HEADINGS | vbase-eye-flow-scanning#Layout rules that follow | add a visible short label under each icon (Học, Diễn đàn, Giải, CLB) or drop the ones the tab bar already has |
| F5 | major | region first screen, all widths (index.html:90-101) | "Vào Phòng" (white raised card, shadow) sits above the green "Chơi nhanh"; on light mode the squint test shows two equal-weight blocks, primary is the second stop. Note: the Chơi-nhanh-first order was reverted in fe73d33 — listed for the record, not a new request | FLW-FOCAL-POINT | vbase-eye-flow-scanning#How to check | (user decision) keep, or flatten "Vào Phòng" (no shadow, outline only) so green stays the single focal point |
| F6 | minor | 768/1280/1440: `.zen-hero` + `#home-stats` (x=74, left) vs `.hub` (x=380-900, centred), shell.css:225, 325, 352 | two alignment axes on one screen: greeting + stats left-aligned across 1132px, actions centred in 520px | LAY-GRID | vbase-layout-spacing#Grid | centre hero+stats in the same 520px column, or left-align the hub |
| F7 | minor | client/js/i18n.js:732 `shell.lobby` (vi table) | Vietnamese UI shows English "Home" in top nav and tab bar next to "Phòng", "Xếp hạng", "Giải", "Tôi"; tab says "Giải", nav says "Giải đấu" | FLW-HEADINGS | vbase-eye-flow-scanning#Layout rules that follow | "Trang chủ"/"Sảnh"; one name for tournaments |
| F8 | minor | client/css/shell.css:280 `#qm-actions:empty { min-height: 38px }` | on home `#qm-actions` is empty but keeps 38px; with `.hub-more` margin 24px gives a ~64px dead gap (375: 455-533) between status line and explore icons | LAY-GROUPING | vbase-layout-spacing#Spacing scale | drop the reserve when the actions slot never fills on home |
| F9 | minor | 375/768 light: `#home-stats` labels, `#qm-line` (12px) over the blue grid background | 12px muted labels sit directly on grid lines + leaf art; contrast passes (5.67:1 vs flat bg) but the lines cut through glyphs | TYP-BODY-SIZE | vbase-typography#Common mistakes | 14px (`--text-sm`) for these labels, or a faint surface behind the stats row |

Checked, no finding: no horizontal scroll at 320 px (scrollWidth = viewport); touch targets hub 64px, menu chips 44px, `.hub-ico` 48px, tab bar 57px; `:focus-visible` 2px outline on every tabbed control; tab bar pads `env(safe-area-inset-bottom)` with `viewport-fit=cover`; white on brand 4.98:1 light / 4.90:1 dark; muted text 5.67:1 light / 7.35:1 dark; zero console errors/warnings.
