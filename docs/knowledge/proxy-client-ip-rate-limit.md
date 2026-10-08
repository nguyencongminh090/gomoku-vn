---
name: proxy-client-ip-rate-limit
description: How gomoku-vn resolves the real client IP behind the Cloudflare Tunnel and how that IP keys the room quota and express-rate-limit instances.
domain: gomoku-vn
tags: cloudflare-tunnel,client-ip,rate-limit,room-quota,spoofing
apply_when: "Touching anything keyed per IP: MAX_ROOMS_PER_IP, express-rate-limit limiters, getClientIp(), trust proxy, or adding a new limiter or route."
sources: "2026-08-02-same-test-run-surfaced-a-second-distinct-crash, 2026-08-02-fix-18-second-pass-user-reported-that-on, 2026-08-02-todo-md-30-flagged-in-the-previous-entry, 2026-08-02-backend-todo-phan-b-7-review-3-2, 2026-08-04-todo-md-43-instruction-md-43-review-12, 2026-08-04-todo-md-44-instruction-md-44-review-12, 2026-08-09-auth-rate-limit-shared-ip-behind-tunnel, 2026-08-15-todo-124-getclientip-xff-last-element, TODO #7 #30 #43 #44 #92 #93 #124"
last_reviewed: 2026-10-09
confidence: high
---
# Real client IP behind the Cloudflare Tunnel

## Why this note exists
Behind the tunnel every TCP peer is loopback (cloudflared connects locally). The same bug (all users collapse into one IP) was found separately for the room quota (#30, then #44 after 6 rounds) and for the HTTP rate limiter (#92). Each fix only covered the layer where it was seen.

## Facts and rules
1. Deployment: Cloudflare Tunnel, one hop, over loopback. `socket.handshake.address` and `req.socket.remoteAddress` are always loopback there.
2. Resolve IPs only through `resolveClientIp(headers, remoteAddress)` in `server/utils/get-client-ip.js`. Wrappers: `getClientIpFromReq(req)` for Express, `getClientIp(socket)` in `server/socket/state.js`.
3. Priority: `CF-Connecting-IP` first (Cloudflare sets it at the edge, overwriting; zone confirmed proxied via the Cloudflare API on 2026-08-04). Fallback: `X-Forwarded-For` only when the raw peer is loopback, taking the LAST element (`.split(',').pop()`, #124), not the first.
4. The raw peer must be read from `req.socket.remoteAddress`, never `req.ip`: Express folds XFF into `req.ip`, so loopback-vs-spoofable can no longer be told apart.
5. `app.set('trust proxy', 'loopback')` is set in `server/index.js`. Without it express-rate-limit throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` on every `/api/auth` request. It does NOT fix socket.io: engine.io reads `remoteAddress` directly.
6. Every `express-rate-limit` instance must set `keyGenerator: (req) => ipKeyGenerator(getClientIpFromReq(req) || '')`. `ipKeyGenerator` is required by express-rate-limit v8 for custom generators (IPv6 normalised to /56). Present on `authLimiter` in `server/routes/auth.js`.
7. `gamesLimiter` and `tournamentGamesLimiter` still lack `keyGenerator` (grep of `server/routes/*.js` on 2026-10-09 finds it only in `auth.js`): same collapse bug, filed as #93 (300 req/15 min, lower severity). Any new limiter must set it.
8. Room quota: `MAX_ROOMS_PER_IP` (default 3, deliberately >1 because of carrier NAT / shared wifi) is derived by scanning `this.rooms` in `RoomManager.createRoom()`, never a tally (a tally leaks when one teardown path forgets to decrement).
9. Rooms in empty-room grace (`EMPTY_ROOM_GRACE_MS`, 20s) are exempt from the main quota via the `graceRoomIds` third argument built in `LobbyHandler.js` from `emptyRoomGraceTimers`; they are capped separately by `MAX_GRACE_ROOMS_PER_IP` (default 3), so the exemption cannot be used to evade the quota. `RoomManager` must not import `state.js` (circular require), hence the parameter.

## Symptom -> real cause -> fix
| Symptom | Real cause | Fix |
|---|---|---|
| `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` on `/api/auth` | Tunnel adds XFF, Express does not trust it | `trust proxy` = `'loopback'` (not `true`) |
| 3-room cap acts as a site-wide cap | engine.io ignores XFF; peer is loopback | `getClientIp(socket)`, then CF-Connecting-IP priority (#44) |
| "Too many requests" for unrelated users/phones | `authLimiter` keyed on default `req.ip` (#92) | `keyGenerator` via `getClientIpFromReq` |
| Shared-wifi user locked out of creating a room | Abandoned rooms in grace counted toward quota (#43) | `graceRoomIds` exemption plus separate cap |
| Client could choose its own IP | XFF first element is client-writable | Use last element, honour only from loopback peer (#124) |

## Verify before calling it fixed
- `npx jest server/tests/get-client-ip.test.js server/tests/auth-rate-limit-ip.test.js server/tests/RoomManager.test.js server/tests/LobbyHandler.test.js`.
- `auth-rate-limit-ip.test.js` mounts the real limiter: 20 requests on one `cf-connecting-ip`, the 21st is 429, a different `cf-connecting-ip` still gets 200. Mirror this for any new limiter; mocking the limiter proves nothing.
- Through the real tunnel, compare two devices on different networks; local dev has no CF header and exercises only the fallback.

## Do not use when
Changing limits' numeric values only, or per-user (not per-IP) throttling such as chat flood protection.

## Related
`authn-sessions-cookies.md`, `be-realtime.md`, `auth-session-oauth.md`; TODO #7 #30 #43 #44 #92 #93 #124.
