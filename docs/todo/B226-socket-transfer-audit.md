# B226 — Audit: all server↔client data transfer and broadcast (part 2)
**Area:** server/socket/** (state.js, SocketHandler, handlers/*), server/routes/**, client socket consumers (lobby.js, room-socket, chat/DM/notification code)
**From:** user 2026-10-12 — "mở rộng vấn đề này sang toàn bộ các socket… broadcast nước đi, display user lobby, lobby user ticket… mọi vấn đề liên quan và xoay quanh broadcast, transfer data between server & client"   **Depends:** B225 (reuse its pattern)

## Problem
Performance pass over everything the server sends clients: payload size, who receives what, how often, full-state vs delta, poll vs push. Dashboard (B225) is only the first case.
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
