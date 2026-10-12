# B230 — `lobby:online_users`: snapshot once, then joined/left deltas
**Status:** ✅ DONE 2026-10-12 (uncommitted) — fix-log 2026-10-12-b230; harness re-run recorded there
**Area:** server/socket/state.js (`broadcastOnlineUsers`, `getOnlineUsersList`), server/socket/handlers/LobbyHandler.js (subscribe), client/js/lobby.js (online line), client/js/private-chat.js (`updateOnlineUsers`, `isOnline`)
**From:** audit #226 finding F1, 2026-10-12   **Depends:** #229 (narrows the audience first)

## Problem
Every connect/disconnect anywhere sends the full list (~70 B/user) to every lobby socket: one flush = 180 KB @50
users, 2.79 MB @200 (O(n²)); ~95 % of all measured bytes. New subscribers also get it twice (subscribe reply + flush).
Measured: `docs/notes/2026-10-12-socket-transfer-audit.md`.
## Scope
1. Snapshot on `lobby:subscribe` (as now); flushes send `{ joined: [...], left: [userId...] }` diffed against the last flush (same technique as `_diffLobbyRooms`).
2. Client applies deltas to its map; feeds lobby online line + PrivateChat.
3. Server tests: diff correctness (join+leave in one window, hide-online toggle, same user two tabs); jsdom for apply.
4. Re-measure with the harness: churn flush bytes ∝ churned users, not N².
## Don't
- Don't change who counts as online (sessions, `hiddenOnline`). No change to `home:stats` count.
## Traps
- A socket subscribing between flushes must not miss or double a delta → idempotent apply (add existing = no-op, remove missing = no-op).
- Reconnect = new snapshot (#228). Hide-online toggle must emit `left`/`joined`.
## Why this way
Delta keeps the modal and partner-online check working without on-demand fetches. Rejected: count-only + fetch list on modal open (breaks live `isOnline` in PrivateChat).
## Done when
- Tests + `npm test` green; harness numbers recorded in the fix-log; real-browser pass (online line + DM modal); `?v=` bumped.
