# F440 — Rooms H UI: rule tabs, online rail, compact table cards
**Status:** ✅ DONE 2026-11-24
**Area:** client/index.html (#screen-rooms), client/js/lobby.js, client/css/rooms-hall.css (+ new rooms-h.css), client/js/room-rules-guide.js, i18n
**From:** features/rooms-redesign-v4 direction H + card v3, approved 2026-11-24   **Depends:** F439

## Problem
Replace the #364 photo hall + mini-board cards with approved mockup `features/rooms-redesign-v4/h-hai-cot.html`.

## Scope
1. Sticky stats bar: đang online, đang chơi, "Mở bàn"; phones add "Xem người online" (opens the roster sheet).
2. Desktop left rail = online roster, "Hạng theo <luật>", search, groups (ranked, Chưa có hạng <luật>, Khách),
   collapses to faces; "Tải thêm" pages via F439 S3.
3. Tabs Luật 1 / Luật 2 / Tiêu chuẩn / Renju with table counts + "Luật chơi" (RoomRulesGuide on the selected rule,
   marker "Đang chọn"). No "Tất cả" tab.
4. Filters Còn ghế, Gần trình tôi (disabled + reason without own Elo), time buckets; sort select.
5. Card v3: header #ID + state + viewers + "Vào" (all states); two seat lines avatar + name + Elo (`1890`, `1203?`,
   Mới, Khách); one-line footer time | Tính điểm/Giao hữu. No board, no size, no "vs", no coloured side stripe, never wraps.
6. Empty tab: "Chưa có bàn <luật> nào đang mở" + "Mở bàn <luật>" (create modal preselects the rule).
7. Remove join-by-code (`#join-code-1`, `#btn-join-code`) and its tests' expectations.

## Don't
- No "a · b" joins; avatars only via `PlatformShell.avatar()`; never touch board.js / room.html.

## Traps
- `body` overflow-x must stay `clip` (#215 sticky). Bars clear the 56px nav and the phone tab bar.
- Patches arrive every 2.5 s: update cards in place (keep `updateRoomRowNode` pattern), no re-render storms.
- Labels: "Tiêu chuẩn" (room wording) unless the user says otherwise; guests listed last.

## Done when
- jsdom tests (tabs, rank per rule, filters, card markup, no wrap classes), cache-bust OK, real-browser pass at 1280 + 390
  compared with `features/rooms-redesign-v4/shots/h-*.png`.

## Built 2026-11-24 (`ui/rooms-h`, uncommitted)
- `js/rooms-h.js` (window.RoomsH, jsdom-tested in `rooms-h.test.js`) owns the screen; lobby.js keeps modal + online feed.
  Subscribe `{rule}` from lobby-home.js; tab switch → `rooms:rule` event → re-subscribe. Rule remembered (`gvn_rooms_rule`).
- Filters/sort non-default → grid = `rooms_query` answer (patches update held cards, add none). Own Elo for
  "Gần trình tôi" = one `/api/profile/card/<me>` read. Roster PM/card click via `[data-online-roster]` (private-chat.js).
- Deviations: time chips follow the server buckets ("Nhanh ≤ 5 phút", "Chậm > 5 phút", not "≥ 10"); sort "Elo cao
  trước" (server sorts by Elo); footer mode = new keys "Tính điểm"/"Giao hữu"; filter-empty state "Bỏ lọc" added.
- Follow-up (`feature/440-seat-guest`): `lobbyEntry` seats carry `isGuest` → guest seats read "Khách" (RoomManager.test).
- Real-browser pass (isolated :3101, throwaway DB, guest + 2 members, 3 tables): 1280 light/dark + 390 match `h-*`
  shots; seats "Mới"/"Khách", tab counts 2/1/0/0, empty Renju state, rules tab, phone sheet; 0 console errors,
  0 wrapping cards, no x-overflow, no join-by-code. `npm test` 4642/4642. Playwright e2e suite not run.
