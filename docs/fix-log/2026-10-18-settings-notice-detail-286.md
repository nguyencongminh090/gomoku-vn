# #286 — "Room settings changed" notice named nothing
**Root cause:** `RoomHandler` `room:settings` emitted a fixed `ROOM_SETTINGS_CHANGED` line regardless of what changed (and even for no-op saves).
**Fix:** `RoomManager.updateSettings` returns `changes` ([{k,v}], diff of validated values); handler sends them as `vars.changes` and skips the line when empty; `chat-ui.js` renders "Cài đặt phòng: Kích thước bàn: 19×19 · …" via existing i18n labels (+6 `sys.*` keys, vi/en). Only room-visible settings are included. Went with per-change detail, not coalescing. User's "Do #286" taken as the go-ahead for `server/`.
**Test:** `RoomManager.test.js` "changes (#286)" ×2; `client/tests/room-settings-notice.test.js` ×2. ?v= bumped.
**Unverified:** real-browser/socket pass (two clients, host changes settings); old clients just show the generic line.
