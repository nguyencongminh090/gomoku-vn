# F500 — Replay: player avatar and rating (data gap)
**Status:** ✅ DONE 2026-11-27 (branch feature/500-501-replay-players-rule, uncommitted)
**Area:** server/db/games.js getGameById, server/db/tournaments.js, client/js/replay.js
**From:** features/replay-redesign, 2026-11-27   **Depends:** —

## Problem
The replay payload has only `black_player_name`/`white_player_name` (display names). `getGameById` strips
player ids (the endpoint is public), and `/api/profile/card/:userId` and `/api/profile/:username` need an id or a username,
so the replay cannot show avatars, ratings or profile links. The redesign leaves them out.
## Scope
1. Decide a public-safe field (e.g. username or a card id per seat, null for guests) on `/api/games/:id`
   and `/api/tournament-games/:id`.
2. The replay shows the avatar from the same source/markup as the other pages (consistency rule) and links to the profile.
## Don't
- Expose internal user ids if the privacy note in getGameById still applies; ask first.
## Done when
- Avatar identical to the profile/social pages; guests fall back to the X/O stone; tests on both endpoints.
## Result
- User decision 2026-11-27: per seat `{username, avatarUrl, rating}`, no id field (id only inside avatarUrl, as rankings/profile card already serve); rating = `rating_history.rating_before` of this game, null when unrated.
- `game.seats = {black, white}` on both endpoints via `server/managers/replay-seats.js` (avatarUrlFor); ids from `getGameSeatUserIds` / `getTournamentGameSeatUserIds` (entry → tournament_players.player_id). Guest / deleted account → null.
- Client: `PlatformShell.avatar` + seat-stone badge, `/profile/<username>` link, rating; guest keeps the stone. Phone: won pill shows the trophy only (word is screen-reader text).
- Tests: `server/tests/replay-seats-rule-500-501.test.js`, `client/tests/replay-page.test.js` (seats block). Real browser (own DB, :3101) 1280 + 390, 0 console errors.
