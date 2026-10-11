# 2026-10-12 04:22 — #230 `lobby:online_users`: snapshot once, then joined/left deltas
## Prompt
"Do #230"
## Root cause
`broadcastOnlineUsers` sent the whole online list (~70 B/user) to every lobby socket on every connect or
disconnect, so one flush cost O(n²) bytes (2.79 MB @200). Subscribers also received the list twice
(the subscribe reply plus the flush).
## Fix
- `server/socket/state.js`: added `sendOnlineSnapshot` (full list on `lobby:subscribe`, seeds the baseline) and
  `_diffOnlineUsers` (same technique as `_diffLobbyRooms`). The flush now emits `lobby:online_patch` `{ joined, left }`,
  or nothing when nothing changed. `joined` also re-sends changed entries (e.g. a rename). Removal candidates are
  the baseline plus every userId handed out in a snapshot since the last flush, which covers a user who joins and
  leaves inside one window while someone subscribes (the #187 trap).
- `LobbyHandler.js`: subscribe calls `sendOnlineSnapshot`. Dead `_getOnlineList` removed.
- `client/js/lobby.js`: `applyOnlineUsersPatch` is idempotent (upsert/delete by userId, re-sorted by displayName).
  `setOnlineUsers` feeds the online line and PrivateChat as before. The snapshot (reconnect, #228) replaces the list.
- No change to who counts as online, `hiddenOnline`, or `home:stats`. Branch `fix/230-online-users-delta` off dev. `?v=312`.
## Verification
- New `server/tests/online-users-delta.test.js` (10): churn-only payload, no-op flush, join+leave in one window,
  short-lived user, mid-window subscriber trap, idempotent convergence, hide/unhide, second tab, rename.
- New `client/tests/online-users-patch.test.js` (5, jsdom). Updated SocketHandler/LobbyHandler/lobby-room-tabs tests.
  `npm test` 2934/2934 (the first run had 5 failures while /tmp hit its disk quota; a clean rerun passed).
- Harness `scripts/measure-socket-transfer.js 3150 200 20 30` on a scratchpad copy with a fresh DB. Online-list bytes:
  | phase | before | after |
  |---|---|---|
  | B room setup | 2.79 MB | 37 KB |
  | C 20 spectators | 3.07 MB | 285 KB |
  | G 10-tab churn | 6.14 MB | 338 KB (incl. 150 KB of resubscribe snapshots) |
  | A 200 connect burst | 4.16 MB | 4.15 MB (200 joins × 200 receivers; this phase can't shrink) |
- Real browser (headless Chromium, 2 users, throwaway server): online line 1→2→1, modal lists both, DM window
  Online→Offline. Frames: one `online_users`, then patches only. 0 console errors.
