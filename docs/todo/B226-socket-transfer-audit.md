# B226 — Audit: all server↔client data transfer and broadcast (part 2)
**Area:** server/socket/** (state.js, SocketHandler, handlers/*), server/routes/**, client socket consumers (lobby.js, room-socket, chat/DM/notification code)
**From:** user 2026-10-12 — "mở rộng vấn đề này sang toàn bộ các socket… broadcast nước đi, display user lobby, lobby user ticket… mọi vấn đề liên quan và xoay quanh broadcast, transfer data between server & client"   **Depends:** B225 (reuse its pattern)

## Problem
Performance pass over everything the server sends clients: payload size, who receives what, how often, full-state vs delta, poll vs push. Dashboard (B225) is only the first case.
Leads from #225 (code-read 2026-10-12, unmeasured): (a) `lobby:online_users` = full list to every lobby socket per change → O(n²) per burst;
(b) `lobby.js` emits `lobby:subscribe` at load on every screen → dashboard/tournaments screens still get `lobby:patch` + online list;
(c) lobby not re-subscribed after reconnect (see #227); (d) role-based filtering (admin/staff/guest), move/spectator, chat/DM/notify not yet looked at.
## Scope
1. Inventory every socket event + HTTP poll: emitter, audience (all / room / user), frequency, payload shape and size, full vs delta. Output a table in `docs/notes/` or the feature folder.
2. Measure the hot paths first: move broadcast, lobby room list (`broadcastLobbyUpdate`), `lobby:online_users` (full list to every lobby socket), lobby/user ticket, chat/DM, spectator joins.
3. Rank by cost × frequency; for each finding state the fix (narrow audience, delta, debounce, drop fields, subscribe-only-when-visible) and risk.
4. Implement only the findings the user approves, one item per fix; split into new `docs/todo` items.
## Don't
- No code changes in this item beyond measurement scripts. No change to board/stone rendering or the room clock (see diagnostic-page-sync rule) without a separate item.
- No guessing numbers: measure with a real server copy (scratchpad, own DB — see playwright-e2e-safety).
## Why this way
Audit before optimizing: avoids patching the visible layer. Library notes to read first: `SKILLS_TREE/knowledge/web-development/items/be-realtime.md`, `software-architecture/items/dist-messaging-patterns.md`, `dist-idempotency-retries.md` (unread so far).
## Done when
- Inventory table + ranked findings committed; user picks which become fix items.
## Result (2026-10-12)
Steps 1–3 done → `docs/notes/2026-10-12-socket-transfer-audit.md` (F1–F7), harness `scripts/measure-socket-transfer.js`.
Step 4: user approved F1–F3 → #230 (F1), #229 (F2), #228 (F3). F4–F7 not filed. Library notes in "Why this way" not read (findings came from measurement).
**Status:** ✅ DONE 2026-10-12 — audit + measurements; fixes tracked as #228–#230.
