# 2026-11-13 15:10 — untracked (#370 follow-up) social: unread notification stays after reading
## Prompt
"social tab — Notify for unread not hide when user click / already read. -> need update"
## Root cause
1. Opening a DM thread POSTs `/api/dm/:u/read`; the server marks it read AND deletes the `dm` bell row
   (`DmService.markReadFrom` → `notifications.drop`). `social.js markRead()` only reloaded conversations,
   so the shell bell (`bell.items`/`unread`) — and the `#notifs` view rendered from it — kept the row until
   the 60 s `refreshBell` poll. Early return `if (c && !c.unread)` also skipped threads whose conv count
   was already 0 while the bell still held the `dm` row.
2. Clicking a notification calls `markRead(id)` then follows the link; for cross-page / full-reload targets
   (`/social.html`, `/u/…`, `/c/…`) unload could abort the in-flight POST → item came back unread.
## Fix
- `PlatformShell.notifications.refresh()` (= `refreshBell`); `social.js markRead` awaits it after the POST,
  and also runs when the bell holds an unread `dm` from this person.
- `/api/notifications/read` fetch: `keepalive: true`.
## Verification
- `client/tests/social-bell.test.js`: 3 new tests (thread read → bell badge hidden + no unread dot, both
  conv-unread cases; read POST has keepalive) — red on old code, green now. `npm test` 3736 pass; cache-bust OK.
- NOT verified: real browser (abort-on-navigate can't be shown in jsdom).
- Out of scope, recorded: lobby `private-chat.js` (`/api/dm/id/:id/read`) has the same stale-bell gap → #371.
