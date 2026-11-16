# F402 — Create-room modal: dropdown comboboxes + server-remembered last settings
**Status:** ✅ CLOSED 2026-11-16 by user request — merged to dev; left unverified: e2e specs (undo, swap2-opening), real-phone select picker, EN language switch with modal open
**Area:** client/index.html, client/js/lobby.js, client/css/lobby.css, server/db/migrations/017, db/profiles.js, routes/profile.js, socket/handlers/LobbyHandler.js
**From:** user 2026-11-16 (after 3 mockups, `client/room-create-modal-mockup.html`): "giữ giao diện chọn nhanh hiện tại. Nhưng thay việc chọn bằng click qua việc chọn dropdown combobox. Thêm cơ chế backend ghi nhớ lựa chọn của người chơi (lần tạo mới lấy settings lần tạo trước đó)"   **Depends:** —

## Problem
Modal picks board/rule/opening/timer/mode with click pills; every open resets to a fixed preset.
## Scope
1. Replace the radio pill/cards groups (mode, board, win rule, opening, timer mode) with native `<select>`; toggles (wall/portal) and number inputs stay.
2. `users.last_room_settings` (JSON, nullable). Saved server-side on a successful `room:create` for members (validated settings, no room name). Returned by `GET /api/profile/prefs` as `roomDefaults`.
3. Modal open: members → roomDefaults; guests → localStorage `gvn_room_last_settings`, forced friendly; none → LITE_DEFAULT_SETTINGS (19×19 + wall; summary = one chip per setting).
## Don't
- No change to quick-match/PairRoom/challenge room creation (not "created from the modal").
- Room name is never remembered.
## Traps
- Swap2 disables wall/portal; blitz enables increment: interlocks must follow the select `change` events.
- Guests have no users row → localStorage only.
## Done when
- Backend + jsdom tests green; real-browser pass of modal desktop + phone.
