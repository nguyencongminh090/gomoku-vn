# F438 — Lobby seat alert: notify when a matching table opens
**Status:** ✅ DONE 2026-11-24 — server matching (state.js `setSeatAlert`, `lobby:alert_set`/`lobby:seat_alert`), client `seat-alert.js` + chip in rooms-h; backend jest (seat-alert +13, LobbyHandler +3), jsdom (seat-alert 11, rooms-h +4), real-browser pass 1280+390 (isolated DB): arm → non-matching rule silent → matching table toast → Vào enters; reload keeps it armed; mute 10 min silences. Limit: only pages holding the lobby socket (index.html) alert; other shell pages open no socket.
**Area:** client/js/lobby.js, server/socket/state.js (lobby:patch), notifications
**From:** features/rooms-redesign-v4 brainstorm, 2026-11-24   **Depends:** rooms v4 direction + backend S1/S5

## Problem
A player waiting for "Luật 2, 5 phút, near my level" must keep watching the lobby. Tables that match get taken by
whoever happens to be looking.

## Scope
1. "Báo khi có bàn" toggle that saves the current rule tab + filters (Còn ghế, time bucket, near my level).
2. While the lobby or any page with the shell is open, a matching new waiting table raises a toast/bell entry with "Vào".
3. Off by default; one alert per table; mute for 10 minutes.

## Don't
- No push/email in the first cut. No server-side per-user filter storage until the client-only version is used.

## Traps
- With room paging (#382) the client only sees one page: the match must be computed on the server or on full patches.

## Done when
- A matching waiting table opened by another user alerts within one lobby patch; non-matching ones never do.
