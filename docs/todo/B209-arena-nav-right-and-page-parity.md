# B209 — Arena parity: nav right cluster + leftovers vs platform-arena-mockup
**Status:** PARTIAL 2026-10-10 — P1 items 1,3,4,5 fixed on `ui/arena-parity-nav-tabs` (uncommitted, ?v=228): order [mode][bell][gear][me], sun svg, bare bell + orange badge (dark ink for contrast), "Chưa xếp hạng" second line, rankings scope → underline tabs on their own row. Open: gear removal (B211), P1 item 6 (mobile 4 controls, follows gear), P2 leftovers (column order, hero stat, tab icons, club page).
**Area:** client/js/platform-shell.js, client/css/platform-shell.css (+ rankings/profile/clubs/club pages for the P2 list)
**From:** user 2026-10-10 "nav at user avt, notify, settings... does not match demo {pnav__right}"; review of #189   **Depends:** B189, B190, B193

## P1 — `.pnav__right` (mockup `.nav__right`: [mode] [bell+dot] [me])
Measured at 1280: mockup 34×34 mode · 29×30 bell · 130×34 me. Real 32×32 bell · **30×40 mode** · 32×32 gear · 113×34 me.
1. Order: mockup mode → bell → me; real bell → mode → gear → me.
2. Gear: not in the mockup nav (settings is "Chỉnh sửa" on the profile + the footer link). Real adds a 3rd icon button.
3. Mode glyph: mockup sun icon (`ph-sun-dim`); real text `◐`, which makes the button 30×40 (taller than its 32×32 siblings). Sprite lacks sun/moon (check `grep 'id="ph-' phosphor-sprite.svg` first; add glyphs or inline SVG).
4. Bell: mockup = plain icon, no fill, 29×30; badge orange `--accent2` #d85000, 9px, top 0/right -2px. Real = filled 32×32 button, green brand badge. (Bell panel/dropdown is real behaviour the mockup lacks — keep it.)
5. User chip: mockup avatar + name 13px/600 + `small` rating always shown ("Gomoku 1612"). Real shows name only until `/api/rankings/me` returns a rating (new users: none, so the second line is absent).
6. Mobile (390): mockup = brand + mode + bell + avatar. Real adds the gear (4 controls) and the 40px min-size rule makes them wide.

## P2 — page leftovers seen in the same pass
- Rankings: scope tabs are green chips (Tất cả/Việt Nam/Bạn bè); mockup = underline tabs (Toàn site/Việt Nam/CLB của tôi/Bạn bè). Mockup variant+speed chip rows; real keeps 3 variants, no speed (decided in B189).
- Rankings empty state still draws the table header card; mockup has no empty state.
- Profile: hero stat "Hoà" vs mockup "Chuỗi thắng" (win-streak not built; B191). Mockup shows Thách đấu/Kết bạn/Nhắn tin on the viewer's own profile; real hides them (correct, keep).
- Mobile tab bar: "Xếp hạng" uses a podium icon (mockup: crown); "Tôi" is not highlighted on the viewer's own profile (mockup: bold/active).
- Club page: real mixes management (Quản lý form) into the overview column; mockup has the rank table + Sắp tới aside. Owner sees "Xoá CLB" only (mockup: "Quản lý").
- Rankings columns: real order Người chơi·Rating·7 ngày·CLB·Khu vực·Ván vs mockup Người chơi·Khu vực·Rating·7 ngày·CLB; on mobile the 6th column (Ván) is clipped.
- Rankings mobile: scope chips + rule chips share one wrapping group with identical active colour → read as one set. Separate them (own row/label) or make scope underline tabs (see B210 systemic 1).

## Decided (user 2026-10-10)
- Gear leaves the nav; Settings becomes a real page/tab for the platform (user: "we should consider Setting tab" — the gear panel suited the old small site). Scope → B211. Until B211 ships, keep the gear (don't strand settings).
- P1 items 1,3,4,5,6 proceed without further input; item 2 (gear) waits on B211.

## Don't
- Don't remove the bell dropdown.

## Done when
- Re-shot pair (real vs mockup, 1280+390, dark+light) shows the right cluster matching; `?v` bumped; shell jsdom tests updated.
