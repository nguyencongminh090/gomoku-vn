# B447 — Club chat: slash commands + notifications, toggled in club settings
**Status:** ✅ DONE 2026-11-24 — on `feature/447-club-chat-commands` (cut from `ui/club-hoi-quan`, needs B446 merged first); review fixes: open-chat refreshes when the dot saw newer messages, hint keys ignore IME composition
**Area:** `server/managers/ClubChatCommands.js` (new), `ClubService.js` (postMessage, updateClub, getClubDetail), `NotificationService.js` TYPES, migration `019`, `client/club.html`, `client/js/club.js`, `client/css/club.css`, `client/js/platform-shell.js` (notifTarget), `client/js/i18n.js`, tests
**From:** user note with "Do #446", 2026-11-24: "For Chat channel, you may support some slash command and notify ... (put it in settings of groups for group admin to control."   **Depends:** B446

## Problem
Club chat (trò-chuyện channel, #446) is plain text. User wants slash commands and notifications in it, each switchable by the club's admins in the group settings.

## Decided with the user (2026-11-24)
- Commands: `/ghim <text>` (staff set the pinned announcement), `/giaohuu @name [rule] [time]` (unrated challenge to a member, default freestyle 5+3).
- Notify: @mention, notify all on a new pin, `@all`/`@tatca` (staff), unread dot on trò-chuyện. Polls / calendar / event reminders → #449, #450.

## Scope (as built)
1. `clubs.chat_settings` JSON (6 booleans, `CHAT_DEFAULTS`; `notifyAll`, `notifyPin` default off); edited via `PUT /api/clubs/:slug {chatSettings}` (staff), whitelist + booleans only.
2. `postMessage` parses on the server: unknown → `CLUB_COMMAND_UNKNOWN`, toggle off → `CLUB_COMMAND_DISABLED`, `/ghim` by a member → `CLUB_FORBIDDEN`. `club_messages.kind` = text | pin | challenge, `meta` JSON.
3. Notifications `club_mention`, `club_all`, `club_pin` through `NotificationService.push`; bell opens `/c/<slug>#ch=chat`.
4. Composer hint list (combobox/listbox, arrows/Enter/Tab/Esc) shows only enabled commands this role may use; toggles under "Trò chuyện" in cài-đặt-nhóm.
5. Unread dot: `lastMessageId` (newest by others) in the club payload + localStorage last-seen; away from the chat, the 8 s poll asks `?after=<cursor>` only.
## Don't
- Push a new socket on the club page (evicts the lobby socket); keep REST polling unless a todo changes that.
## Traps
- `announcement` is stored raw (textContent); chat bodies are the `DmText.clean` wire form. `/ghim` writes both: raw to the pin, cleaned to the chat row.
- `push()` dedupes on (type, actor): A's mention in club X is replaced by A's mention in club Y. Accepted.
- `@all` / pin fan-out ≤ 500 pushes: staff only, one per club per 10 min (in-memory `lastFanOut`; restart re-opens the window). A re-pin inside the window updates the pin without pinging again; `@all` inside it → 429 `CLUB_NOTIFY_COOLDOWN`.
- `ChallengeService` is required lazily inside `/giaohuu` (it pulls in the room stack).
- Migration 019 was applied to the PC dev `gomoku.db` (user_version 19) by a stray `require` on 2026-11-24; if another 019 lands first, that DB would skip it.
- Client highlights `@all` only when the author is staff and `notifyAll` is on (when the server really notified).
## Why this way
- One JSON column instead of 6 columns: additive, whitelisted in `ClubChatCommands.mergeSettings`. Commands parsed server-side only. Knowledge notes: none.
## Done when
- Backend tests (`server/tests/club-chat-commands.test.js`: settings auth, disabled/unknown refused, mentions, @all cooldown, /giaohuu), jsdom (`client/tests/clubs-pages.test.js` B447 block: hints, toggles, system rows, mentions, unread dot), real-browser pass. All done 2026-11-24 (full suite green incl. 34 backend + 18 jsdom B447 cases; real-browser pass on an isolated :3101 server, desktop light/dark + 390px phone).
