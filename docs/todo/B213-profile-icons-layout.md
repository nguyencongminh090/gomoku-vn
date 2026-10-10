# B213 — Profile: one icon system + layout/spacing/size pass
**Status:** OPEN — built 2026-10-10 on `ui/profile-polish` (`?v=251`), awaiting review
**Area:** client/profile.html, client/js/profile.js, client/css/platform.css, client/js/i18n.js, phosphor-sprite.svg
**From:** user 2026-10-10 "Chuẩn hóa icon trong hồ sơ + xem xét layout, padding/margin, button size, text size <check css>"; measured on a seeded real-server copy   **Depends:** #212

## Problem (measured 1280/390, dark/light)
- Icons: 13px (1em of 13px text) inside 38px buttons; only 3 of ~10 actions have one (Chỉnh sửa, Chấp nhận/Từ chối, Bỏ kết bạn,
  Huỷ lời mời, Gửi thách đấu, Xem thêm have none); meta line + badges have none.
- Layout: badges float between header and "Rating theo thể loại" (h2 sits 14px under them); challenge form opens between Thách đấu
  and Nhắn tin, pushing Nhắn tin to a new row; rating cards are a 4-col grid with 3 cards (empty 4th); streak value "3 (cao nhất 4)"
  wraps on 390; game rows 68px tall (date on a 2nd line); inline `style="margin-bottom:20px"`; "Xem thêm" is 28px high vs 38px buttons.
- Sizes: 11 font sizes (10–26px incl. 12.5/11.5/15); card label 10px uppercase; spacing 14/22/28 off the 4px scale; `.pbadge` defined twice.
## Scope (profile-scoped: `.pprofile …`; shared classes only where the visual stays the same)
1. Sprite + regular `pencil-simple`, `x`, `user-minus`, `paper-plane-tilt`. Every profile action: leading 16px regular icon.
2. Meta line: calendar + map-pin; badges move into the header, each with an icon (medal / trophy / flag-checkered).
3. Challenge form opens below the action row; streak = two stats (Chuỗi thắng, Cao nhất); cards auto-fill; game rows one line (date right).
4. Profile type scale 11 (uppercase labels) / 12 (meta) / 13 (controls) / 14 (body) / 22–26 (numbers, name); spacing from `--space-*`.
5. `.pbadge`: one rule (same look everywhere). Drop the inline style.
## Don't
- Club page (`phead`/`pstats` shared) must look the same; no backend/API change; chart drawing untouched.
## Why this way
`docs/knowledge/ui-ux/vbase-layout-spacing.md` (4px scale, no odd values, proximity groups), `vbase-typography.md` (few sizes per
layout), `vbase-visual-principles.md` (result not by colour alone — the word stays). Icon set = #212 (Phosphor regular, one per concept).
## Done when
- profile-page jsdom asserts (icons per action, streak stats, form after actions); `npm test`; seeded real-browser pass 1280/390 dark+light, club page unchanged.
## Result
profile-page.test.js 26→32 (6 fail on old code). Seeded copy (25 games, 3 ratings, 2 clubs, 3 badges), 1280/390 × dark/light,
self + other: 0 console errors. Also: ≤860px header = avatar+name row, rest full width (buttons stacked 1/row before);
stats 3 cols; rating cards 3 cols; club page re-shot unchanged. Not changed: "0 tuần này" shown when the weekly delta is 0.
