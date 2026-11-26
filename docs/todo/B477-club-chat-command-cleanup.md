# B477 — Club chat: slash command cleanup
**Status:** OPEN
**Area:** `client/js/club-policy.js`, `server/managers/ClubService.js` (postMessage), `client/js/club.js` (hints, submit), i18n, tests
**From:** [features/club-chat-refactor](../../features/club-chat-refactor/planning.md) §2, table approved 2026-11-26 (Q3)   **Depends:** —

## Scope
1. Mark `mute` and `kick` as `retired: 'members'` in the policy.
   - `find()` still resolves them, but `available()` drops them.
   - The server answers `400 CLUB_COMMAND_MOVED` with a message pointing to the thành-viên channel. The client keeps the text in the composer.
2. `/trogiup` becomes a client alias that opens the `/` popup and leaves the list. The server still answers `help` for API clients.
3. `/lich` with no argument opens the sự-kiện channel on the client, with no server call. Staff `/lich dd/mm HH:MM Tên` opens the create sheet prefilled; the sheet itself is B480 (until then, the current form).
4. `/binhchon` always opens the poll sheet prefilled. The `cmdPoll` toggle also hides the composer poll button.
5. Popup rows show an icon tile, `/word`, the arguments, a description and the alias, matching mockup `slash`. All strings go through i18n.

## Don't
- Remove any `chat_settings` key. No toggle changes here.
- Turn a retired word into `CLUB_COMMAND_UNKNOWN`.
## Traps
- `mergeSettings` returns a 400 on unknown keys. If a toggle is ever retired, keep its key as an accepted no-op.
- Record in this file: delete the retired aliases one release after deploy.
## Done when
- Backend: a retired word gives `CLUB_COMMAND_MOVED` for staff and members, and the other commands are unchanged.
- jsdom: the popup lists only the available commands, and the alias opens the popup.
- Full `npm test` passes, cache-bust prints OK, and a real-browser pass at 390 px and desktop.
