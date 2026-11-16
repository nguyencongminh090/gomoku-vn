# 2026-11-13 #371 — lobby DM window read leaves the bell stale
## Prompt
"do #371"
## Root cause
`private-chat.js loadHistory` POSTs `/api/dm/id/:id/read`; server deletes the `dm` bell row, but the shell bell
(`bell.items`/`unread`) only re-fetched on the 60 s poll. Same gap as the social page, recorded in the previous fix-log.
## Fix
After the POST resolves, call `PlatformShell.notifications.refresh()` (guarded; no prune locally — server stays the source).
## Verification
- `client/tests/private-chat-history.test.js`: new test (refresh called once, after the POST) — red on old code, green now.
- NOT verified: real browser.
