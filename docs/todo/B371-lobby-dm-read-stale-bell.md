# B371 — Lobby DM window read leaves the bell stale
**Status:** OPEN
**Area:** client/js/private-chat.js, client/js/platform-shell.js
**From:** found while fixing social unread (fix-log 2026-11-13-social-unread-stale-bell)   **Depends:** —

## Problem
Lobby chat windows POST `/api/dm/id/:id/read`; server deletes the `dm` bell row, but the bell keeps it until the 60 s poll.
## Scope
1. After that POST resolves, call `PlatformShell.notifications.refresh()` (exists since the social fix).
## Don't
- Prune bell items locally (server is the one source).
## Done when
- jsdom test: read in a lobby window → bell badge drops without waiting for the poll.
