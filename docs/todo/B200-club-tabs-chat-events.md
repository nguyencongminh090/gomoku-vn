# B200 — R6: club tabs, events ("Sắp tới"), club chat, club tournaments
**Status:** ✅ DONE 2026-10-10 — all 4 slices merged to `dev` (bf775b4, 966b734, 4b3084b, e90c292), `?v=211`; club-vs-club stays parked in `features/club-team-tournament/`
**Area:** server (ClubService, new club_events + club_messages tables, routes/clubs.js, tournament link) + client (club.html/club.js tabs)
**From:** features/platform/planning.md § Release 2 (R6); B191 item 5; mockup `data-screen="club"`   **Depends:** B178 (clubs), B198 (notifications), B199 (done)

## Problem
`/c/<slug>` is one scroll (leaderboard, staff, manage). Mockup has tabs Tổng quan / Thành viên / Giải của CLB / Bảng xếp hạng / Trò chuyện and a "Sắp tới" list (events, club tournaments). No events, club chat, or club↔tournament link exist.

## Scope (slices, one branch each off dev, reviewed + merged separately)
1. **Tabs (client only)** — regroup existing sections into tabs, `#tab=` hash, mobile-safe; Tổng quan = description + stats + staff + "Sắp tới"; Thành viên = member list/manage; Bảng xếp hạng = current board. No new endpoints.
2. **Events** — `club_events(id, club_id, title, starts_at, kind 'event'|'friendly', created_by, created_at)` (migration inline like #199). Staff create/delete via `/api/clubs/:slug/events`; list = upcoming only (≤ 20, past hidden); shown on Tổng quan.
3. **Club chat** — `club_messages(id, club_id, sender_id, body, created_at)`; REST `GET ?before=` + `POST` (members only), **polling, no socket** (one-live-socket rule); reuse `DmText.clean` + rate limit; keep last N per club; staff can delete a message.
4. **Club tournaments** — nullable `tournaments.club_id`; tab lists the club's tournaments (status, date, entrants) from existing data; staff create one through the existing tournament flow with the club preselected. No new pairing logic.
5. ~~Club-vs-club~~ **Out of R6** — user's idea is a *team tournament* (size L): recorded in `features/club-team-tournament/`, needs its own design + todo. Events keep `kind` 'event' only (drop 'friendly').

## Don't
- No socket for club chat/pages (evicts the lobby socket). No new clock/room code. Don't redesign the member roles (owner > officer > member, #178). Guests never see chat.
- Don't fan out a bell notification to all members per event/message (decided: none).
## Traps
- Pending members (`role='pending'`) are NOT members for chat/events access — reuse `roleOf` and the `!= 'pending'` filter.
- Chat text is user content: store the cleaned wire form, escape at render (textContent), same as DMs.
- Deleting a club must cascade events/messages (FKs `ON DELETE CASCADE`); leaving a club doesn't delete one's old messages.
- Timezone: store ISO UTC, render in viewer's locale; mockup shows "T7 · 20:00".
- Tournament list must respect existing visibility/status rules of the tournament module (draft = organizer only).
- `RoomManager.test.js` counts `broadcastRoomUpdate(io` sites (24) — add none. New `err.*` codes → vi+en i18n + `error-codes-i18n-consistency.test.js`.
- Bump `?v=N` everywhere; `node scripts/cache-bust.js` must print one value.
## Decided (user, 2026-10-10)
1. Club chat: **members only** (pending/outsiders see no chat).
2. Events and club tournaments: **owner + officers** create/delete.
3. New event: **no bell notification** — shown on Tổng quan (+ home "Hôm nay" later), avoids per-member fan-out.
4. Club-vs-club = team tournament ("each club registers N players, individual results summed into a team score") → separate feature `features/club-team-tournament/`, not in R6.
## Why this way
Tabs first = zero backend risk and unblocks the layout; chat/events are new tables only (additive). Polling matches the Social page precedent (B198). Check `docs/knowledge/INDEX.md` (realtime, moderation/UGC rows) before slice 3.
## Done when
- Per slice: backend tests (access matrix: guest / non-member / pending / member / officer / owner) + jsdom + real-browser pass (copy repo to scratchpad, own DB :3100, `playwright-e2e-safety`); `?v=N` bumped; DONE entry.
## Slice 1 notes (2026-10-10, `feature/200-club-tabs`, uncommitted)
- `club.html` → tablist (Tổng quan / Thành viên / Bảng xếp hạng) + 3 panels; `#tab=<name>` in the URL, arrow keys, unknown tab → overview, tab kept across data reloads. Overview = staff + manage/pending (staff only); Members = name/role/kick-promote-transfer (`#cb-members-body`); Board = rank/name/rating with category chips (`#cb-body`, no role column anymore). No endpoint changes. `?v=205`.
- Tests: clubs-pages (+6, 4 adapted to the new ids). Real-browser: no-DB static pass at 1280/390 (faked API, 0 console errors, no horizontal scroll); not yet on the real server. Overview has no "Sắp tới" yet (slice 2).

## Slices 2–4 notes (2026-10-10)
- 2 events: `club_events`; staff POST/DELETE `/events`; upcoming (≤20) embedded in club detail as `events`. `kind` fixed to `event`.
- 3 chat: `club_messages` (newest 200 kept); REST GET `?before|after`/POST/DELETE `/messages`, members only (code `CLUB_CHAT_MEMBERS_ONLY`, not `CLUB_NOT_MEMBER`, which kick/role also use); polling 8 s, no socket; shares the DM rate limit (`DmText.isRateLimited`).
- 4 tournaments: nullable `tournaments.club_id` (SET NULL; inline migration); `tournament:create {clubSlug}` → owner/officer only (`TOURNAMENT_CLUB_FORBIDDEN`); club detail `tournaments` (≤50, all statuses). Create handoff via `sessionStorage.gvn_club_tournament` — `lobby-home.js` strips `location.search`.
- Verified: `npm test` 2379 green; real-browser pass per slice (own DB :3100). NOT verified: light mode, Firefox/WebKit, `dist/` build (#194), registering players into a club tournament in a browser.