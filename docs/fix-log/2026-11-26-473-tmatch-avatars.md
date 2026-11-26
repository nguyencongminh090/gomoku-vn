# 2026-11-26 18:33 — #473 Tournament match shows initials instead of uploaded avatars
## Prompt
"do #473" — a player with an uploaded photo shows it in room.html but initials on tournament-match.html (seat cards and series score card).
## Root cause
Wire payload, not the page: `TournamentMatchHandler` sent `engine.serialize().players` and `_seriesInfo().scores`,
neither of which carries `avatarUrl` (the room's players get it from `RoomManager.avatarLookup`). The seat
cards already rendered `player.avatarUrl`; the score card drew initials only. Same gap in
`tmatch:swap2_state.players`, which the page swaps in after an opening — a photo would vanish there too.
## Fix
- Server: `_avatarOf()` (avatar-lookup.js `avatarUrlFor`, guests → null, same guard as RoomManager),
  `_playersOut()`/`_serializeForInit()` used by all 3 `tmatch:init` emits and both `tmatch:swap2_state`
  emits; `_seriesInfo().scores[]` gains `avatarUrl` (so `tmatch:ended` series scores too).
- Client: score card uses the seat cards' `avatarInner()` (URL whitelist) + shared `bindAvatarFallback()`
  (CSP-safe onerror → initials); the pre-result fallback scores keep the players' `avatarUrl`.
## Verification
- `server/tests/TournamentMatchHandler.test.js` "#473" (5 tests: init/subscribe/resync, guest, series scores
  with flipped seats, swap2_state) — failed before the fix; 2 exact-shape asserts updated (`avatarUrl: null`).
- `client/tests/tournament-match-arena.test.js` "avatars (#473)" (4 tests; 3 failed before).
- `npm test` 5110/5110; `cache-bust.js` OK.
- Real browser (own server :3101, throwaway DB + AVATAR_DIR): real upload, best-of-3 tournament, both
  checked in → seat + score card show the photo (HTTP 200, no console errors) at 1680 px (spectator)
  and 390 px (player), before and after game 1; `tmatch:ended` scores carry avatarUrl.
