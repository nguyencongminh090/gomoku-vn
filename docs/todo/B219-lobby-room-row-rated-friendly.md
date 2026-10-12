# B219 — Lobby room row: show Rated / Friendly
**Status:** ✅ DONE 2026-10-12 — merged to dev ae74e99 (?v=316); reused room.mode_* i18n keys; no real-browser pass
**Area:** server/managers/RoomManager.js (`listRooms`), server/socket/state.js (lobby patch), client/js/lobby.js (`buildRoomMeta`), i18n
**From:** user 2026-10-11 ("okay" to recording it) after the lobby Phòng screen Arena pass; mockup rows read "Caro VN 5+3 · xếp hạng · 1/2"   **Depends:** —

## Problem
The create-room modal now sets `settings.ranked` (RoomManager.js:791), but the lobby list payload
(`listRooms`, ~RoomManager.js:632-646) does not carry it, so a room row cannot say Rated/Friendly.
## Scope
1. Add `ranked` to each `listRooms` entry (and to the lobby patch/snapshot shape if it whitelists fields).
2. `buildRoomMeta` (client/js/lobby.js): add a `lobby.mode_rated` / `lobby.mode_friendly` segment ("Xếp hạng" / "Giao hữu").
3. Backend test for the payload field + jsdom test for the meta segment.
## Don't
- Don't change rating logic or the wire shape of other events.
## Traps
- Backend change: UI-workflow lock does not apply to this item; do it on a `feature/*`/`fix/*` branch, not `ui/*`.
- Rows built from `lobby:patch` upserts must carry `ranked` too, or the segment flickers off after a patch.
## Done when
- A rated and a friendly room show different meta in the lobby; tests green; `?v=N` bumped.
