# B480 — Club events: month calendar + create sheet (Vietnam time)
**Status:** ✅ DONE 2026-11-26 — branch feature/480-club-event-calendar; full `npm test` 5097/5097, cache-bust OK, Chromium pass 390 px (touch) + 1280 px, both themes, temp DB, browser in America/New_York (shots `features/club-chat-refactor/shots/b480/`). NOT tried on a real phone. Deviations: out-of-month cells are selectable (open their month); before the month answer arrives the grid uses the page's upcoming list; staff keep the trash button per agenda row; channel subtitle now "Lịch hoạt động của nhóm" (mockup)
**Area:** `client/js/club-policy.js` (VN helpers), `ClubService` (month query), `routes/clubs.js`, `client/club.html` + `club.js` + `club.css` (sự-kiện), sprite (`caret-left`), i18n, tests
**From:** [features/club-chat-refactor](../../features/club-chat-refactor/planning.md) §4, §6.6, mockups `calendar`/`event`, 2026-11-26   **Depends:** —

## Scope
1. Add `vnParts(iso)` and `vnToIso({y,m,d,hh,mi})` to `club-policy.js`. `parseEventArg`, the form, the grid's day keys and the agenda all use them.
2. `GET /api/clubs/:slug/events?month=YYYY-MM` returns events of that VN month, past included, capped at 100 rows.
   - Same visibility and RSVP fields as `upcomingEvents`. Reject a bad month with 400.
3. **Month grid:**
   - Monday first; header "Tháng m, yyyy"; a "Giờ Việt Nam (GMT+7)" label.
   - Today ringed, dots for event days, ‹ › and "Hôm nay".
   - APG grid keys: arrows, Home/End, PageUp/Down. One tab stop.
4. **Agenda** for the selected day: time, "GMT+7", title, "N người tham gia", the RSVP toggle, and "Đã diễn ra" for past events.
5. **Staff "Tạo sự kiện" sheet:**
   - Title with a counter; day chips plus `type=date`; time chips plus `type=time step=900`; the zone line; a live preview.
   - Submit calls the existing `POST /events` with `vnToIso(...)`.

## Don't
- Use `new Date(<datetime-local>)`: it reads the viewer's zone, which is today's bug.
## Traps
- Month boundaries must be VN days (00:00 GMT+7), not UTC or local.
- Keep `/lich` prefill working (B477 routes it here).
## Done when
- Backend: the month range and its VN edges, 400 on a bad month, past events included.
- jsdom under `TZ=America/New_York`: grid days, agenda grouping, a form value of 28/11 20:00 sent as `2026-11-28T13:00:00.000Z`.
- Full `npm test` passes, cache-bust prints OK, and a real-browser pass at 390 px and desktop, in both themes.
