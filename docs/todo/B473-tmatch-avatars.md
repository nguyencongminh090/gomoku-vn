# B473 — Tournament match shows initials instead of uploaded avatars
**Status:** ✅ FIXED 2026-11-26 — avatarUrl on match players + series scores; see [fix-log](../fix-log/2026-11-26-473-tmatch-avatars.md)
**Area:** server/socket/handlers/TournamentMatchHandler.js (tmatch:init players), client/js/tournament-match.js
**From:** match page redesign (ui/tmatch-room-sync), 2026-11-25   **Depends:** ui/tmatch-room-sync merged

## Problem
`tmatch:init` players carry no `avatarUrl`, so a user with a photo shows it in room.html but initials in a
tournament match (hard rule 9). The series score card also shows initials only.

## Scope
1. Add `avatarUrl` (server/managers/avatar-lookup.js) to match players and series scores.
2. Seat cards already render `player.avatarUrl`; do the same in the score card. Socket + jsdom test.

## Don't
- Don't build the URL on the client.
## Traps
- Guests have no avatar (see RoomManager's lookup guard).
## Why this way
Same source and URL form as the room.
## Done when
- Same photo in room and match; tests pass; real-browser check with an uploaded avatar.
