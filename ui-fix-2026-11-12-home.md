Worked from: ui-audit-2026-11-12-home.md (selected F1-F4, F6-F9; F5 is a user decision)

## Fix results
| id | change (file:line) | status |
|---|---|---|
| F1 | client/css/tokens.css:94 light `--c-brand-text` #41701a → #3d6418 (= brand-dark, token-first; dark mode untouched). "Caro VN" tag now 4.67:1 on its 18% tint; the token's plain-bg uses only gain contrast | fixed |
| F2 | client/js/i18n.js:1146-1147 (+ en 2726-2727) key split `qm.guest_casual_only` + new `qm.guest_login_rated`; client/js/lobby-home.js `guestNote()` renders the second half as `<a class="qm-line__login" href="/login.html">`; shell.css `.qm-line__login` underlined, brand-text | fixed |
| F3 | client/js/lobby-home.js `setSegments` `opensMenu`: the rule + time tags are `<button class="rtag rtag--btn" aria-controls="qm-menu">` that open the options menu; shell.css `.rtag--btn` hover ring + focus-visible outline | fixed |
| F4 | client/index.html:118-124 each `.hub-ico` = circle (`.hub-ico__c`) + visible label (`.hub-ico__l`: Học / Diễn đàn / Giải đấu / Câu lạc bộ); aria-label/title removed (visible name). shell.css `.hub-ico` column 80px. Trophy duplicate of the tab bar kept (label fixes the discoverability; dropping a link is a product call) | fixed |
| F5 | none — order Vào Phòng / Chơi nhanh was set by the revert fe73d33 | needs-user |
| F6 | client/css/shell.css `.hub`, `#home-mine-card` margin auto → 0; `.psplit > :is(.hub, .hub-more, #home-mine-card)` justify-self center → start, max-width 520px: one left axis with greeting + stats | fixed |
| F7 | client/js/i18n.js:732 vi `shell.lobby` 'Home' → 'Trang chủ' (nav + tab bar). "Giải" (tab) vs "Giải đấu" (nav) kept: `shell.tournaments_short` is a deliberate short key for 5 tabs at 320px | fixed |
| F8 | client/css/shell.css `#qm-actions:empty { display: none; }` (was min-height 38px, B261). It fills only with the cancel button of a user-started search (input-driven, not CLS). client/tests/lobby-cls-reserve.test.js updated to the new invariant | fixed |
| F9 | client/css/shell.css `.hstat__l` and `.qm-line__note` → `var(--text-sm)` (were 12px) | fixed |

Re-check (live, :3101 isolated DB, 375/1280 light+dark): COL-CONTRAST-TEXT tag 4.67:1 light / 7.27:1 dark; LAY-NO-HSCROLL 0 at 320; hub-ico circle 48px + label (80×72 hit area); console errors 0. `node scripts/cache-bust.js` OK; `npm test` 201 suites pass (lobby-home 56, lobby-cls-reserve 8).
Not done: desktop right half is now visibly empty (left-aligned hub) — see the fill-space proposal.
