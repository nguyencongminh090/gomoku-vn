# B189 — Rankings/profile/clubs pages don't match the Arena mockup
**Status:** ✅ DONE 2026-10-09 (phase 1; branch `ui/arena-platform-pages`, uncommitted) — new `css/platform.css` (Arena components, tokens only, `[hidden]` guard) + `js/platform-shell.js` (sticky nav, mode toggle, user chip, mobile tab bar); rankings/profile/clubs/club rebuilt on it; avatars in rankings+club tables; profile date fixed (MM/YYYY); Settings gear dropped from these pages; old profile/rankings/clubs.css removed; ?v=184. Verified by screenshots vs mockup: desktop dark+light, mobile dark (faked API, static server). Phase 2 → B190.
**Area:** client/css (shell/pages), client/rankings|profile|clubs|club.html, client/js/{rankings,profile,clubs,club}.js
**From:** user 2026-10-09 "current UI does not match" client/platform-arena-mockup.html   **Depends:** B176, B177, B178

## Problem
Side-by-side render (1280×900, dark; mockup vs real) shows the 4 new pages are a plain card-in-column
layout, not the Arena dashboard. Gaps:
1. **Shell:** mockup = sticky 56px nav with link row (Chơi/Phòng/Giải đấu/Xếp hạng/CLB/Học, active pill), mode toggle, bell, user chip; mobile bottom tab bar. Real = brand + "Sảnh" + gear only; no tabbar.
2. **Width/spacing:** mockup content 1180px, `.intro` h1 22px; real 860px narrow column.
3. **Rankings:** missing variant+speed chips (green active), scope tabs (underline), search box, avatar initials, Khu vực/7 ngày/CLB columns, delta colours. Real: names are default blue links; extra pager.
4. **Profile:** missing hero card (xl avatar, actions Thách đấu/Kết bạn/Nhắn tin, big stats), 4-col rating cards with weekly delta, rating chart, split layout (chart+recent | clubs+badges). Real: stacked boxes, plain underlined links, date `3/1/2026` (US order) and "Thamgia" missing space.
5. **Clubs/club:** list rows lack avatar + meta line; club has no hero (stats Thành viên/Rating TB/Hạng CLB), tabs, "Sắp tới"/"Ban quản trị" aside.
6. **Bugs seen:** (a) club page shows Join + Leave + Delete at once — `.profile__btn{display:inline-block}` overrides the `hidden` attribute (same trap on any `hidden` element given a display); (b) Settings gear appears on these pages but `settings-panel.js` needs `session.js` (unloaded) → would throw on open; (c) links use default blue.

## Scope (proposed — confirm before building)
Phase 1 (what exists in data): shell nav + tabbar on the 4 pages, mockup spacing/typography/components (chips, tabs, table w/ avatar, cards, hero), fix bugs 6a–c, date format via locale. Phase 2 (needs new data → separate todos): weekly delta, rating chart, badges, region/club columns, "Hạng CLB", speed chips (ratings are per rule, no speed — keep 3 variant chips, drop speed row).

## Don't
- Don't touch board/stones; no new data columns in phase 1; don't restyle lobby/room.
## Done when
- Real-browser side-by-side of the 4 pages vs mockup, desktop + mobile, dark + light; no hidden-attr leaks.
