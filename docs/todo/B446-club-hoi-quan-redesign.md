# B446 — Club pages redesign: CL4 "Hội quán" (server-style shell)
**Status:** ✅ DONE 2026-11-24 — user approved ("approve 446"); `ui/club-hoi-quan` merged into `dev`
**Area:** `client/club.html`, `client/clubs.html`, `client/js/club.js`, `client/js/clubs.js`, new `client/css/club.css`, `client/js/i18n.js`, `client/tests/`
**From:** user pick 2026-11-24, `features/club-redesign/` (mockup `mockups/cl4-hoi-quan.html`, shots `shots/cl4-hoi-quan-*`)   **Depends:** —

## Problem
Club pages are a header + tab panels. User chose the CL4 "Hội quán" shell (rail, channels, chat centre, members by presence) from 6 mockups. Not started.

## Scope
1. Branch `ui/club-hoi-quan` off `dev`. Rebuild both pages' DOM to the mockup shape (DESIGN.md "Hội nhóm (#446)"); don't re-skin `.phead/.ptabs`.
2. `club.css` scoped under `.cl-hq`; tokens only, `--cc` from `club.color`.
3. Map existing data only: getClubDetail fields, `/mine` for the rail, `/messages` polling (keep REST polling, no socket: it would evict the lobby socket), events, tournaments (status, players), weekly, leaderboard, pending/invites/history for staff.
4. Every current action keeps working: join/leave/request, copy link, invite + suggestions, approve/reject, role change, kick, avatar/banner/identity edit, events add/delete, announcement, delete club, delete message, load older.
5. Phone (≤860px) per DESIGN.md; tab bar never covers the composer.
6. i18n vi + en; jsdom tests per viewer (visitor open/invite, invited, member, officer, owner); cache-bust; real-browser pass 1280 + 375, dark + light.
## Don't
- Server changes in this item. API-tagged mockup parts (presence, live games of members, activity cards, RSVP, unread counts, online per club) are hidden until their own todos exist.
- Show real messages to non-members (gate shows a skeleton).
- Use the "A · B · C" or comma-joined facts pattern.
## Traps
- `[hidden]` vs class `display` (platform.css rule); SVG has no `.hidden`.
- Full-height shell inside `.pl` page + fixed tab bar: compute the height, don't let the page scroll twice.
- Owner cannot leave; officers can't act on staff (server enforces; UI must hide, not just fail).
## Decisions (2026-11-24)
- Members pane = role groups (Ban quản trị, Thành viên; staff: Chờ duyệt on top). Presence and the other API items stay hidden; their todos come later.
- Slash commands + notify toggles → #447, not here.
## Build notes (2026-11-24)
- New `client/js/club-kit.js` (rail + seeded stone banner, shared by both pages), `client/css/club.css`; dead tab-layout `.cb-*` rules dropped from platform.css. Old `#tab=` links alias to channels.
- API gaps found (not built, server unchanged): `/api/clubs/mine` has no `color`/`tag` (rail crests show initials on grey) → #448; `listClubs` has no `bannerUrl` (featured cards use the generated banner).
- Phone: shell ends at the tab bar (one scroll area); my row with Rời nhóm shows in thành-viên only. ≤860px the thành-viên table stacks one card per member, actions wrap (0 offscreen at 375). `#tab=manage` (join-request bell link) → đơn-xin-vào; the bell now links `#ch=requests`.
## Done when
- Matches the mockup at 1280/375 both modes with real data; all actions above work; tests + `npm test` green; user approves.
