---
name: i18n-and-server-message-codes
description: Server sends language-neutral codes, client maps them to t() keys; checklist for new error codes, system chat, and i18n pitfalls
domain: gomoku-vn
tags: i18n,error-codes,socket,chat,client
apply_when: "before adding or changing any server error, system chat message, or user-visible string in server/ or client/js/"
sources: "2026-08-04-todo-45-1-root-cause-auth-error-codes, 2026-08-04-todo-45-2-socket-level-error-codes, 2026-08-04-todo-45-followup-system-chat-and-middleware, 2026-08-06-todo-46-login-js-password-toggle-i18n-fallback, 2026-08-12-todo-103-followup-wall-second-move-i18n-key, 2026-08-14-todo-120-login-language-toggle; TODO #45 #46 #103 #120"
last_reviewed: 2026-10-09
confidence: high
---
# i18n and server message codes

## Why this note exists
Server-sent Vietnamese text ignored English mode (#45, six sub-fixes plus a follow-up that found 27 more spots). New server codes shipped without client keys (#103) and showed raw keys to players.

## Facts and rules
1. Server errors carry `code` (language-neutral, UPPER_SNAKE) next to the Vietnamese `error`/`message`/`text`, which stays unchanged for logs. Server keeps no language state.
2. Client maps `code` to a key: `err.<code lowercase>` for errors, `sys.<code lowercase>` for system chat (`chat:message`, `isSystem`). Interpolated text sends `vars`, used as `{name}` placeholders.
3. Helpers: `serverMessage(data)` in `client/js/room-socket.js` (falls back to `data.message` without a code); `systemText(msg)` in `client/js/chat-ui.js`; `ERROR_CODE_KEYS` and `errorMessage()` in `client/js/login.js`.
4. **Every new server `code` needs `err.*`/`sys.*` in both `TRANSLATIONS.vi` and `TRANSLATIONS.en` in `client/js/i18n.js`.** `t()` falls back to the vi dict, then returns the raw key, so a missing key shows `err.some_code` to the user (#103: `err.wall_second_move_min_distance`).
5. Never write `t('x') || 'fallback'`: `t()` returns the key (truthy) when missing, so the fallback is dead code (#46 `aria-label` showed `login.hide_password`).
6. Never write `data.error || t(...)`: the server always sends Vietnamese, so the `t()` branch never runs (#45-1).
7. Unknown-user and wrong-password both return `INVALID_CREDENTIALS`; do not leak the difference through `code`.
8. The language switcher mounts into `.login-lang-switch-row` in `login.html` (selector at the end of `i18n.js`). Mounting on a layout class that a redesign removed fails silently (#120, was `.card__logo`).
9. Two enforcement tests: `server/tests/error-codes-i18n-consistency.test.js` (every code in the scanned server files has a key in vi and en; vi/en key sets equal) and `server/tests/auth-error-codes.test.js`. Add new scanned files there.
10. `server/scripts/admin.js` (CLI) is out of scope for i18n.

## Symptom -> real cause -> fix
| Symptom | Cause | Fix |
|---|---|---|
| Vietnamese error in English mode | server text shown verbatim | `code` plus key |
| Raw `err.xxx` in alert | key missing in i18n.js | add vi and en |
| aria-label is a key string | missing key, dead `||` | add keys, drop fallback |
| No language toggle on login | dead mount selector | new container |
| "Fixed" yet Vietnamese remains | sibling files skipped (middleware, state.js, DisconnectHandler) | grep all `text:`/`message:`/`error:` |

## Verify before calling it fixed
- `npm test` (consistency suite).
- Grep `server/` (excluding `server/scripts/`) for Vietnamese `error:`/`message:`/`text:` without `code:`.
- Switch to English in a real browser and trigger the error; the DOM must show no dotted key.
- Bump `?v=` after touching `i18n.js`.

## Do not use when
Purely visual changes, or strings that never cross the server/client boundary and already use `data-i18n`.

## Related
`engineering-method-lessons.md`, `appsec-xss-csrf.md` (chat is escaped on the wire); TODO #45 #46 #103 #120.
