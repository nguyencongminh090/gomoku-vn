# 2026-10-09 12:15 — TODO #93: gamesLimiter/tournamentGamesLimiter shared one budget behind the tunnel

**Prompt:** "Do #93"

**Root cause:** both limiters had no `keyGenerator`; express-rate-limit keys on `req.ip`, which behind the Cloudflare Tunnel is the loopback peer for every visitor → one shared 300 req/15 min budget (same as #92 authLimiter).

**Fix:** `server/routes/games.js`, `server/routes/tournamentGames.js`: `keyGenerator: ipKeyGenerator(getClientIpFromReq(req) || '')`, reusing #92's helper. Nothing else touched. Branch `fix/games-limiter-client-ip`. No client change, no `?v=` bump.

**Verification:** new `server/tests/games-rate-limit-ip.test.js` (real limiters; exhaust IP A → 429, IP B still served). Mutation-checked: removing keyGenerator makes both cases fail. Not verified: real tunnel / browser.
