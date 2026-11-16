# B403 — Profile page redesign: PF7 "Sơ yếu kỳ thủ" (CV sheet)
**Status:** ✅ DONE 2026-11-16 — UI approved by user; merged dev from `ui/profile-cv`
**Area:** `client/profile.html`, `client/js/profile.js`, new `client/css/profile.css`, `client/js/i18n.js`, `client/tests/`
**From:** user pick 2026-11-16, `features/profile-redesign/` (mockup `mockups/pf7-cv.html`, shots `shots/pf7-cv-*`)   **Depends:** —

## Problem
Profile is a flat header + list. User chose the CV layout (PF7) from 7 mockups. Implementation not started.

## Scope
1. Branch `ui/profile-cv` off `dev`. Rebuild the DOM of `profile.html` to the mockup's shape (side column + main sections); do not re-skin the old `.phead/.psplit` structure.
2. New `client/css/profile.css` scoped under `.pf-cv`; layout/tokens per DESIGN.md "Hồ sơ". Mockup CSS is the reference, colours via tokens.css only.
3. `profile.js` render: map existing API fields only — ratings (rating, rank, games, provisional `?`, delta7), stats, streak, badges (keep `BADGE_SUPERSEDED_BY`), puzzles (level may be null → no dots, show solved only), clubs, recent games (date, opponent, result), friendship/can.* actions, `isSelf` (Chỉnh sửa; `SHELL().setActive('me')`).
4. Keep behaviour: rating chart is NOT in PF7 — see Open decisions; "Xem cả N ván" = current load-more paging (`/games?page=`), `#games` hash scroll, 404/error status, privacy states (history hidden → Số liệu + Ván gần đây show the hidden note; bio hidden note for self).
5. Empty states: no ratings, no badges (hide section), no clubs (hide block), no games.
6. i18n vi + en for every new label. jsdom tests for render states; then cache-bust and a real-browser pass at 1280 and 375, dark and light.

## Don't
- No `server/` change in this item. Columns Luật / Nước / ± per game, badge dates and dated career entries are NOT in the API: leave them out (table = Ngày, Đối thủ, Kết quả; Thành tích without dates).
- No "A · B · C" middle-dot strings anywhere (user rule). No copying the mockup's fixture text.
- Don't touch `private-chat.js` user card or `settings` pages.

## Traps
- `[hidden]` vs class `display`; SVG has no `.hidden`; `.pl button{font:inherit}` beats component sizes → `:where()`; check an icon id exists in the sprite before using it.
- Names one line + ellipsis, every flex/grid ancestor `min-width:0` (test a 24-char no-space name).
- `fullPage` screenshots show the fixed tab bar mid-page (artifact).

## Decisions (user 2026-11-16)
- "Quá trình thi đấu": dropped (no API). Rating chart: kept, section under Số liệu (title/caption without "·").
- Phone: Giải đố + Hội nhóm move to the end (grid area `org`). "Sao chép liên kết" on own profile: kept.
- Thể loại chính = variant with most rated games. One filled button: Thách đấu (Đồng ý when a request is incoming).
- Old `.pprofile` rules removed from platform.css; page CSS now only in `client/css/profile.css`.

## Done when
- Page matches `pf7-cv` at 1280/375 in both modes, no h-scroll, no console errors, no "·" separators.
- `npm test` green, `node scripts/cache-bust.js` prints OK, browser-pass screenshots shown to the user.
