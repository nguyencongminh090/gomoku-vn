# B482 — Club chat: delete retired slash aliases
**Status:** ✅ DONE 2026-11-26 — feature/482-club-chat-retired-aliases
**Area:** `client/js/club-policy.js`, `server/managers/ClubService.js`, `client/js/club.js`, i18n, tests
**From:** [B477](B477-club-chat-command-cleanup.md) trap, 2026-11-26   **Depends:** B477 deployed for one release

## Scope
1. Remove `mute` and `kick` from the policy, the `CLUB_COMMAND_MOVED` branch, its i18n keys and the thành-viên link.
## Don't
- Remove `help`: it stays as the popup alias and the API answer.
- Remove any `chat_settings` key.
## Done when
- The old words answer `CLUB_COMMAND_UNKNOWN`; full `npm test` passes.
## Result
- Removed `mute`/`kick` from `club-policy.js`, the `CLUB_COMMAND_MOVED` throw in `ClubService.postMessage`, the
  thành-viên link in `club.js`, and both i18n keys (`err_CLUB_COMMAND_MOVED`, `cmd_moved_link`). `help` kept.
- Done early on user request ("Do #482"); B477 is on origin/dev, prod rollout not verified (no VPS read).
- Tests: club-chat-commands (4 words → UNKNOWN, no message stored) + clubs-pages jsdom (`/duoi` posts, text kept,
  no link). Full `npm test` 289 suites / 5101 tests green; cache-bust OK. No real-browser pass (removal only).
