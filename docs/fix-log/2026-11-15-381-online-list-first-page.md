# 2026-11-15 18:04 — #381 online list: first page + total, rest on demand
## Prompt
Review → user agreed (2026-11-15) to "chỉ gửi tổng số + bạn bè + một trang đầu (ví dụ 50 người), phần còn lại tải khi cuộn hoặc tìm kiếm".
## Root cause
`sendOnlineSnapshot` / `_diffOnlineUsers` (`server/socket/state.js`) mirrored every visibly-online user on every lobby client: snapshot O(online) bytes + one avatar DB get per user per subscribe (1.1 MB / 17 ms at 10 000, 11 MB / 240 ms at 100 000, names shuffled), and every join/leave fanned to all.
## Fix
- Server: clients mirror the first `ONLINE_PAGE_SIZE` (config/env, 50) by name. `lobby:online_users` stays an array (the page); `lobby:online_patch` diffs the page and carries `total` only while truncated (≤ one page online → payloads byte-identical to before). Page cached 250 ms across subscribes, dropped at each flush. New `lobby:online_query` (ack): `{q, offset}` name search / `{ids}` "who of these is online"; name search throttled 200 ms per socket. Home challenge picker hook uses `getOnlineUsersSorted()` (no avatar lookups).
- Client: `lobby.js` count = `total`; `private-chat.js` modal searches through the server when truncated (250 ms debounce, stale answers ignored), chat partners off the page are checked with `{ids}` (on open, ≤ every 10 s on patches, every 20 s), `user:status` offline still applies. i18n `private_chat.more_users`.
- Deviation from the agreed wording: **friends are not listed first** — that needs a per-friend presence push; left for a follow-up (noted in the todo). Branch `fix/381-online-list-paging` (stacked on #380). `?v=` rewritten by cache-bust.
## Verification
- Server: `online-users-delta.test.js` +16 (page, total, eviction off the page, cache, query), `LobbyHandler.test.js` +7; 1 existing test's setup changed (advance past the 250 ms cache). Client jsdom: `online-users-patch.test.js` +5, new `private-chat-online-paging.test.js` (10).
- Bench (temp DB): snapshot at 10 000 online 1 088 KB / 17 ms → 5.5 KB / 3.5 ms uncached, 0.02 ms cached; search 2.3 ms; ids 0.01 ms class. Flush is still one O(online) pass per 1.5 s (3.5 ms at 10 000).
- Real browser (Chromium, isolated server :3117, ONLINE_PAGE_SIZE=5, 13 online): count 13, 5 faces + "+8", modal 5/13 + hint, server search finds an off-page guest, chat opens online, flips offline ≤ 20 s after they disconnect; 0 console errors.
- NOT verified: real phone/Safari; load run; a subscriber that connects inside the 250 ms cache window sees itself only at the next patch (≤ 1.5 s).
