# B370 — Bạn bè page redesign S3 "Trò chuyện" (chat-first, presence, game cards, profile pane)
**Status:** BUILT 2026-11-13, merged to dev — jest + real-browser pass done; open until real-phone/Safari check
**Area:** client/social.html, client/js/social.js, client/css/platform.css (or new social.css), client/js/platform-shell.js (header chat icon), server/managers/FriendService.js, server/routes/friends.js, server/routes/dm.js (+ a small H2H/games query)
**From:** user 2026-11-13 "S3" — features/social-redesign (mockup s3-chat-first, gallery Q5rH73LiRvXhVQFHRf7WVR)   **Depends:** —

## Problem
social.html = 6 equal boxes, no hierarchy, friends show no life, DM squeezed into one box, long names wrap/break mid-word (shots s0-current-*).

## Scope
1. Layout per mockup: left = title + search/add + online "story" strip + conversation list (pending challenges and friend requests pinned on top); centre = full-height thread (header: avatar, name, status, Xem ván / Thách đấu); right (≥1100px) = profile pane. ≤860px: list view, thread opens full screen above the tab bar (`_sheet.html` shape); back returns to the list.
2. Desktop opens the most recent conversation (`#dm=<username>` deep link still wins); none → empty state with my name#code + people online to befriend.
3. Presence detail (server): friends list adds `activity: 'playing'|'watching'|'free'` + `startedAt` when playing (roomManager.getRoomByUser + GameEngine.startedAt); same visibility rule as `online` (isVisiblyOnline).
4. Game cards in chat: thread = DMs merged client-side by time with (a) pending challenges between the two (accept/decline inline, reuse /api/challenges) and (b) finished games between the two (result + "xem lại" link) from `games` (black/white_player_id, winner, ended_at). No DM schema change.
5. Profile pane: rating (seat-rating rules, "?" when provisional), head-to-head W–L, win %, last 5 results vs me; Hồ sơ link, Huỷ kết bạn.
6. Header: chat-circle icon with unread badge next to the bell on every platform page (desktop + phone header), → social.html; phone tab bar unchanged.
7. Names: one line + ellipsis + full name in `title` everywhere on the page (`min-width:0` chain).
8. Keep notifications reachable (bell), outgoing requests + my code + copy (left column / empty state).

## Don't
- Change the DM table, the challenge flow (ChallengeModal #222 stays the sender UI) or the board/stones.
- Poll faster than today (DM 5 s, challenges 10 s); no new socket event unless a test proves polling insufficient.
- Leak presence beyond today's rule (friends only, respects hidden presence).

## Traps
- Ellipsis fails if any flex/grid ancestor lacks `min-width:0` (mockup check: shoot.js spill report).
- Thread re-render on each poll must keep input focus and scroll position.
- H2H must count only games where both ids are set (guests have null ids).
- `?v=` cache-bust for every client edit; platform-shell change touches all platform pages.

## Why this way
User picked S3 from 8 mockups (features/social-redesign/planning.md). Cards come from existing tables (games, pending challenges), so no migration. Rejected: storing cards as DM rows (duplicates game state).

## Done when
- Jest: friends `activity`, H2H/last-5 query, thread merge order, social.js jsdom (list → thread, pinned items, empty state, ellipsis title).
- `npm test` green; `node scripts/cache-bust.js` OK; real-browser pass 1280 + 375 light/dark incl. long names and a live friend game.

## Build notes (2026-11-13)
- API: `GET /api/friends/:username/summary`; friends list adds `activity`/`startedAt`/`roomId`; `/api/notifications` + `/api/shell` add `dmUnread`.
- Elo = friend's most-played rated pool; win % = head-to-head (draw ½). Mockup "Để sau" = existing decline ("Từ chối").
- Presence: `/api/friends` polled 30 s, silent on failure (router limit 300/15 min shared with search + actions). Bell "Xem tất cả" → `#notifs` view.
