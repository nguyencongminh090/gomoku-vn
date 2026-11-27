# B496 — Fair-play: per-game presence summary for staff (PS-11)
**Status:** ✅ DONE 2026-11-27 — migration 028 `game_presence` (one row per player per rated, saved game; CHECKs ≥ 0; FK users CASCADE); `FairPlayPresence` counters fed by RoomHandler (table presence) and DisconnectHandler (drop / return), written in handleGameEnd; own-turn away is an estimate (from the later of stretch start and last move); hourly 90-day prune; `GET /api/admin/presence-signals` (perm rating.integrity) + section in the admin integrity tab (badges, no middle-dot joins); settings privacy note `settings.fairplay_note`. No penalties anywhere.
**Area:** server/db (migration), GameHandler.handleGameEnd, RatingIntegrityService/admin page, i18n rules text
**From:** features/presence-status (planning §4, Q6 A), 2026-11-27   **Depends:** #487
## Scope
1. In-memory counters per player per rated game; one write next to saveGame: `game_presence`.
2. 90-day prune (hourly); staff-only view (`rating.integrity`); player-facing rules/privacy line.
## Don't
- Any automatic penalty; any raw event stream.
## Done when
- Tests: counters, write once, perm check, prune.
