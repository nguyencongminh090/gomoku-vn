# 2026-11-18 10:29 — untracked (ui-audit 2026-11-18 F1–F5) phone Home light-mode menu text + sheet/news/tokens
## Prompt
`/ui-audit home page. Light theme has issue with text (Mobile UI)` → `/ui-fix F1-F5`.
## Root cause
F1: #418 sets `.pnav { color: #fff }` on phone Home; `.pnav a { color: inherit }` (0,1,1) beats `.pnav__item { color: var(--c-ink) }` (0,1,0), so the account-menu `<a>` items (Hồ sơ, Bạn bè, Cài đặt, Quản trị; guest: Cài đặt, Tạo tài khoản) were white on the white light-mode menu (1:1). Dark mode hid it. `<button>` Đăng xuất unaffected.
F3: `.hq-main` is a stacking context (`isolation: isolate`), so the #qm-pick sheet's z-index 70 stayed inside it, under the fixed tab bar (z 20).
F4: `.hnews` padding-right 16px lost to the shared `.hnews:not([hidden])` card rule (higher specificity) → dates flush to the card edge.
## Fix
platform-shell.css: `.pnav__menu` and `.pbell__panel` set `color: var(--c-ink)`. home-hero.css: `.hq-main:has(> .hq-menu:not([hidden])) { z-index: 70 }` (nav is covered while the modal sheet is open); news selector gets `:not([hidden])`; 8 rgba literals → `--hh-*` tokens (F5). DESIGN.md: #418 hero photo recorded as the one Imagery/Forbidden exception (F2). Report: `ui-fix-2026-11-18.md`.
Not fixed (pre-existing, out of scope): `.pnav__item--staff` accent colour also loses to `.pnav a` on every page.
## Verification
New `client/tests/home-light-menu-text.test.js` (5 tests; 4 fail on pre-fix CSS). `npm test` 4355/4355. cache-bust OK. Isolated server :3101, 390×844 @2x: menu items rgb(43,41,38) light / rgb(232,230,225) dark; sheet's last option hit-tests inside #qm-pick (was under tab bar); news date right 362 vs card 378. Real phone not checked.
