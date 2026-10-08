---
name: auth-session-oauth
description: How gomoku-vn authenticates (opaque server-side sessions in an HttpOnly cookie), the Google OAuth state/callback rules, the false "logged in on another device" kick, and the guest to account flow.
domain: gomoku-vn
tags: auth,session,httponly-cookie,oauth,csrf,socket-io,guest
apply_when: "Editing server/routes/auth.js, SessionManager, session-cookie.js, verifySocketToken, SocketHandler.js session:kicked logic, client session.js/login.js, or any OAuth or guest login behaviour."
sources: "2026-08-08-todo-66-auth-cache-control-no-store, 2026-08-08-todo-68-server-side-sessions-httponly-cookie, 2026-08-10-todo-95-oauth-state-cookie-collision, 2026-08-10-todo-96-oauth-callback-idempotent, 2026-08-10-todo-97-oauth-display-name-sanitize, 2026-08-10-todo-101-oauth-state-cookie-reuse-helper, 2026-08-14-todo-119-guest-create-account-bounce, 2026-08-06-session-kicked-false-positive-on-reconnect, 2026-08-21-todo-136-tab-activation-vs-drawer-toggle, TODO #66 #68 #95 #96 #97 #101 #119 #136"
last_reviewed: 2026-10-09
confidence: medium
---
# Auth, sessions and OAuth

## Why this note exists
A "logged in on another device" logout appeared with a single tab (socket.io internal reconnect, then later a duplicated module instance). OAuth review found three flow bugs after the feature was written, and a guest could not reach the register form.

## Facts and rules
1. Sessions are opaque server-side ids (`crypto.randomBytes(32)`) in table `sessions` (no FK to `users`: guests have no `users` row), managed by `server/managers/SessionManager.js`. The client never holds a token (#68, option C).
2. The cookie is `gvn_session` (`SESSION_COOKIE_NAME` in `server/config.js`): `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` derived from `req.secure`. Define set and clear in one place, `server/utils/session-cookie.js`, via `baseCookieOptions(req, path)`; never hand-write cookie attributes elsewhere (#101).
3. Socket.IO bypasses Express middleware: it parses the cookie itself with the shared parser, and `verifySocketToken` (`server/middleware/auth.js`) checks `Origin` first (CSWSH; `cors.origin` does not protect WebSockets). A dead cookie must not fall through to the legacy JWT fallback; the fallback applies only when no cookie is present.
4. All `/api/auth` responses carry `Cache-Control: no-store` (router-level middleware in `server/routes/auth.js`, #66). Do not extend it to `/api/games*` (public data).
5. Logout is a real network call that revokes the session. `session:kicked` writes `revoked_at` before disconnecting the socket.
6. A socket connect carrying `auth.reconnect === true` (set in `client/js/socket-client.js`) evicts the stale socket silently and must NOT emit `session:kicked`. Only a connect without the flag is a real second device.
7. `wrappedOn` in `SocketHandler.js` must not coerce the built-in `disconnect` payload: its reason is a string, coercing hid diagnostics (`reason=[object Object]`).
8. OAuth state cookie is named `gvn_oauth_state_<state>` (one per flow) so concurrent flows cannot overwrite each other (#95). The callback validates `state` against `OAUTH_STATE_RE` (`/^[a-f0-9]{32}$/`) before building the cookie name, then checks the cookie exists.
9. Callback is idempotent (#96): if the state cookie is missing but `code`/`state` are well-formed and the request already carries a valid session, redirect to `/index.html`, not `error=oauth_state`. Without a valid session the error is unchanged, so CSRF failures are not masked.
10. OAuth display names go through `sanitizeOAuthDisplayName()` (strip forbidden chars, re-check 2-24 length, else `generateGuestName()`); the register form keeps reject-and-tell via `isValidDisplayName()` (#97).
11. Guest sessions must not be bounced off `login.html`: `checkExistingSession()` in `client/js/login.js` skips the redirect when the cached user has `isGuest` (#119).
12. The legacy `POST /upgrade-session` and JWT dual-read were meant to be removed after at least 7 days (#68 entry). `POST /upgrade-session` is still present in `server/routes/auth.js` (marked time-boxed) as of 2026-10-09.

## Symptom -> real cause -> fix
| Symptom | Real cause | Fix |
|---|---|---|
| Kicked "logged in on another device" with one tab | `SocketHandler.js` kicked on any new connection per `userId`, including internal reconnect | `auth.reconnect` flag check (Aug 6) |
| Same kick or a tab click collapsing the drawer, no user action | Stale `?v=` -> second module instance, duplicate socket/handlers | Single `?v=N` everywhere, binding guard (#136); see `static-assets-caching-csp-build.md` |
| Two quick Google logins both fail `oauth_state` | Single fixed state cookie overwritten | per-state cookie name (#95) |
| Back/replay of callback shows error though logged in | Cookie consumed by first request | session-aware duplicate branch (#96) |
| Guest clicks "Create account", nothing happens | Login page redirected any believed session | `isGuest` exception (#119) |

## Verify before calling it fixed
- `npx jest server/tests/auth-google-oauth.test.js server/tests/auth-cache-control.test.js server/tests/SocketHandler.test.js server/tests/auth-session-routes.test.js server/tests/socket-session-auth.test.js`.
- Reproduce kicks with a real socket.io transport drop (ping timeout), not only a mocked second connection; run against a throwaway DB (`playwright-e2e-safety`).
- Check `?v=` uniformity first (grep in CLAUDE.md) when a kick has no second device.
- Test the guest path from a guest session, not a fresh visit.

## Do not use when
Per-IP throttling (`proxy-client-ip-rate-limit.md`), chat XSS, or tournament/game rules.

## Related
`authn-sessions-cookies.md`, `appsec-xss-csrf.md`, `be-realtime.md`, `static-assets-caching-csp-build.md`; TODO #66 #68 #95 #96 #97 #101 #119 #136.
