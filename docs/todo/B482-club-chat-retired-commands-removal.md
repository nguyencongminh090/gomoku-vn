# B482 — Club chat: delete retired slash aliases
**Status:** OPEN
**Area:** `client/js/club-policy.js`, `server/managers/ClubService.js`, `client/js/club.js`, i18n, tests
**From:** [B477](B477-club-chat-command-cleanup.md) trap, 2026-11-26   **Depends:** B477 deployed for one release

## Scope
1. Remove `mute` and `kick` from the policy, the `CLUB_COMMAND_MOVED` branch, its i18n keys and the thành-viên link.
## Don't
- Remove `help`: it stays as the popup alias and the API answer.
- Remove any `chat_settings` key.
## Done when
- The old words answer `CLUB_COMMAND_UNKNOWN`; full `npm test` passes.
