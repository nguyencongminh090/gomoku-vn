# B200 — R6: club tabs, events ("Sắp tới"), club chat, club tournaments
**Status:** OPEN — todo only, not started (written 2026-10-10 from `dev` 867cc96)
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
