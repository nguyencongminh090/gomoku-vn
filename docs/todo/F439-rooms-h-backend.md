# F439 — Rooms H backend: per-rule Elo/rank on the roster, per-rule table pages and counts
**Status:** ✅ DONE 2026-11-24 (`feature/rooms-h-backend` → dev; `npm test` 4657/4657; real-server pass :3101 OK)
**Area:** server/socket/state.js, server/socket/handlers/LobbyHandler.js, server/managers/{RoomManager,seat-rating}.js, client/js/lobby-moves.js
**From:** features/rooms-redesign-v4 (direction H approved 2026-11-24), planning.md gaps S2–S6   **Depends:** —

## Problem
Approved lobby H ranks every player by the selected rule tab, shows one tab per rule with a table count, and filters
tables server-side. Today the roster is `{userId, displayName, isGuest, avatarUrl}` (first 50 by name), the mirrored
room page (#382) mixes rules, `lobbyStats` has no per-rule counts, and "playing" counts games.

## Scope
1. S2 roster entry gains `ratings: {freestyle|caro|standard|renju: [rating, rank, provisional]}` (members only).
   Rank from a per-rule rank cache refreshed when a rating changes, never per patch.
2. S3 `lobby:online_query {rule, q, offset}`: page sorted by rank in `rule` (ranked → unranked by name → guests).
3. S4 `stats.byRule = {rule: {open, total}}` over ALL rooms (tab badges).
4. S5 `lobby:subscribe {rule}` / `lobby:rooms_query {rule, offset, open, time, near, sort}`: the mirrored page and
   paging are per rule; filters run on the server.
5. S6 `stats.playing` = seated players in running games.
6. Drop `moves`/`startedAt` from `lobbyEntry` and the #377 moves-delta path (only lobby.js + state.js use them).

## Don't
- No seat rank: cards show Elo only, already sent (`players[].rating/provisional`, seat-rating.js).
- No per-patch DB reads for ratings; no full-list payloads (keep #381/#382 paging).

## Traps
- `getUserRanking` = one COUNT per user/category: N online × 4 needs the cache.
- Hidden-online users stay out of lists and counts. Rule ids = `WINNING_RULES`.
- Removing `moves` breaks lobby-delta / LobbyHandler tests on purpose: update them in the same commit.

## Done when
- Backend tests per item (subscribe per rule, query sort/filter, byRule counts, playing count, cache refresh on rating change).

## Built (deviations / decisions)
- `rank-cache.js`: one scan per rule (rank = getUserRanking's); rating commit → rebuild ≤ 2 s → online + seated rooms re-flushed.
- Channels: `lobby` (online patches) + `lobby:<rule>`; no/unknown rule = `lobby:all` (current client, until #440). `leaveLobby()` at all 6 leave sites.
- `stats` = rule's counts + `playing` + `byRule` on every rule-channel message. `sort`: `state` = page order, `rank` = best seat Elo.
- S3: mirrored online page stays first-50-by-name (rank order via `online_query {rule}`).
- S6 lobby only: `/api/home stats.playing` stays games (labels "ván đang chơi"); seated hidden-online players count (seat is public).
- Removed `lobby-moves.js` + `scheduleLobbyBoardUpdate`; until #440 the lobby mini board is empty and live cards show no elapsed time.

