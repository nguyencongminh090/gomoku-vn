# 2026-10-12 02:54 — #225 Dashboard realtime push
## Prompt
"số người online, ván chơi có vẻ không realtime và phụ thuộc vào refresh" · "server phát đi một event… chỉ cho những người đang ở dashboard?"
## Root cause
`#screen-home` only learned about changes from the 20 s `/api/home` poll (0–20 s late).
## Fix
- New `server/socket/home-feed.js`: socket.io room `home`; `home:subscribe` → snapshot (`home:stats` + `home:live`);
  `scheduleHomeUpdate(io)` coalesces to one flush per 1.5 s, recomputes absolute `{online, playing, searching}`,
  emits only on change; `home:live` (same list as `/api/home`, names only) only when the set of playing rooms changes.
  Subscribe during a pending flush forces that flush to emit (new socket may hold a newer value than the baseline).
- Hooks: `broadcastLobbyUpdate` + `broadcastOnlineUsers` (state.js, lazy require), MatchHandler join/leave/disconnect.
  `routes/home.js` exports `liveOf`/`playingCount`.
- `client/js/lobby-home.js`: subscribe only while home screen shown and tab visible; reconnect/visible → resubscribe
  + refetch; poll 20 s → 60 s fallback. `?v=307`. Branch `feature/225-home-live-push`.
- Deviation from the todo: "leave on disconnect" needs no code (socket.io drops rooms itself).
## Verification
- `server/tests/home-feed.test.js` (9), MatchHandler + lobby-delta hook tests, 6 jsdom tests in `lobby-home.test.js`;
  `npm test` 2908/2908 (one earlier run had a load flake in an unrelated lobby-home case and the ECONNRESET compression test; rerun green).
- Real browser (scratchpad copy, own DB, :3107): A on home sees B connect, guest queue/leave/disconnect, B close
  in 1.17–1.60 s each, 0 `/api/home` fetches meanwhile. SIGKILL restart → resync fetch 2.2 s, push resumes.
- Not verified live: `home:live` on a real game start/end (unit only). SIGTERM restart never reconnects → #227.
