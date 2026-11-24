# B447 — Club chat: slash commands + notifications, toggled in club settings
**Status:** OPEN
**Area:** `server/` (club settings, messages route, notify), `client/js/club.js` (composer, cài-đặt-nhóm channel), `client/js/i18n.js`, tests
**From:** user note with "Do #446", 2026-11-24: "For Chat channel, you may support some slash command and notify ... (put it in settings of groups for group admin to control."   **Depends:** B446

## Problem
Club chat (trò-chuyện channel, #446) is plain text. User wants slash commands and notifications in it, each switchable by the club's admins in the group settings.

## Scope
1. Decide with the user first: command list (e.g. /giaohuu invite, /chiase share a game, /ghim pin announcement for staff, /roll) and what "notify" means (mention @name, new message badge, push on announcement).
2. Per-club settings stored server-side (owner/officer can edit), default off for anything noisy.
3. Server parses/validates commands (never trust the client), rejects disabled ones; notify delivery reuses the existing notification path.
4. `cài-đặt-nhóm` channel gets the toggles; composer shows a command hint list for enabled commands only.
## Don't
- Push a new socket on the club page (evicts the lobby socket); keep REST polling unless a todo changes that.
## Done when
- Backend tests (settings auth, disabled command rejected), jsdom (hint list, toggles), real-browser pass.
