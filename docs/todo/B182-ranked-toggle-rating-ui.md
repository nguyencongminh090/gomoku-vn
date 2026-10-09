# B182 — Room Ranked toggle + rating delta display
**Status:** OPEN
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
