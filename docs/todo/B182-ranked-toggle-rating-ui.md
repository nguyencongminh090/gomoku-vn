# B182 — Room Ranked toggle + rating delta display
**Status:** ✅ DONE 2026-10-09 — toggle in host room settings + own rating line in room log; client/tests/ranked-toggle-rating-ui.test.js; real-browser pass (2 registered users, isolated DB copy); ?v=176
**Area:** client/js (room settings, game-end UI), i18n
**From:** B175 follow-up, 2026-10-09   **Depends:** B175 ✅

## Problem
Server has `room.settings.ranked` (default ON) and emits `rating:update`, but the client has no
toggle and ignores the event — every eligible game between members is ranked, silently.

## Scope
1. Host-only "Ranked" checkbox in room settings (sent as `ranked: boolean` via existing settings update).
2. Show own delta after a ranked game (`rating:update` → `{category, players:[{userId,before,after,delta,provisional}]}`).
3. jsdom tests + real-browser pass.

## Don't
- Build the rankings page (#176) or profile ratings (#177) here.

## Traps
- Toggle is meaningless with a guest seated (server no-ops) — show it disabled/hinted, don't hide state.
- Any client edit bumps `?v=N` (cache-busting rule).

## Done when
- Toggle round-trips; delta shown to both players; tests green.

## Result
- `room-ui.js`: `#r-ranked` toggle in the host's room settings (default ON; disabled + hint while a guest is *seated*; spectator guests don't count); `updateSettings` sends `ranked`.
- `room-socket.js`: `rating:update` → own line via `ChatUI.appendSystemMessage` ("Điểm Tự do: 1200 → 1362 (+162) · tạm tính"); spectators ignored.
- Not in the create-room modal (scope = room settings); new rooms default ON server-side.
- Real browser (isolated copy of repo, port 3123): toggle visible to host only, round-trips to the other client; resign → both see their delta; toggle off → 2nd game adds no line. No page errors.
- Gap: delta is a chat/toast line, not a dedicated result card — fine until #176/#177 give ratings a home.
