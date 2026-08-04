# Fix log entry — 2026-08-02 21:05

## Prompt

Same test run surfaced a second, distinct crash unrelated to #18: `ValidationError: ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` thrown by express-rate-limit on every `/api/auth` request once Cloudflare Tunnel (confirmed by the user as what fronts play3cr.dpdns.org) started adding an `X-Forwarded-For` header that Express was not configured to trust.

## Action

Added `app.set('trust proxy', 'loopback')` in [server/index.js](server/index.js), right after the Express app is created. `'loopback'` rather than `true`: only honor the header when the immediate TCP peer is itself loopback (guaranteed true for a local cloudflared process), so a client that could reach the port directly could not spoof its own `X-Forwarded-For` to dodge the auth rate limit.

## Decision

Investigated whether this also fixes `socket.handshake.address` (used by [LobbyHandler.js:56](server/socket/handlers/LobbyHandler.js#L56) for the `MAX_ROOMS_PER_IP` quota) — it does not: engine.io reads `req.connection.remoteAddress` directly ([engine.io/build/socket.js:38](node_modules/engine.io/build/socket.js#L38)), never `X-Forwarded-For`, regardless of Express's trust-proxy setting. Under this exact deployment that means every real user's room-quota IP currently resolves to loopback, i.e. the 3-room-per-IP cap is effectively a 3-room-per-site cap. Left unfixed here per the project's scope-discipline rule (not what was reported, needs its own decision on approach) — logged as TODO.md #19 instead.

## Summary output

`npm test`: 295/295 passing (1 new source-assertion test in `server/tests/listen-backlog.test.js`, same style as the existing `LISTEN_BACKLOG` wiring tests — asserts against the file text rather than booting the real server, since requiring `server/index.js` binds a real port and opens the real SQLite db). Mutation-checked: reverting `server/index.js` alone made the new test fail, restoring it passed again.
