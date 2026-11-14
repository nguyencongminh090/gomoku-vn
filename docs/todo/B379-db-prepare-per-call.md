# B379 — server/db/*.js prepares SQL on every call
**Status:** ✅ FIXED 2026-11-14 — stmt() cache in connection.js; MAX_ROOMS unset in repo .env (=50), left for user ([fix-log](../fix-log/2026-11-14-379-db-stmt-cache.md))
**Area:** server/db/users.js and siblings
**From:** perf/play-lag CPU profile 2026-11-14 (`prepare` was the top self-time frame)   **Depends:** —

## Problem
Helpers like `getUserById` call `db.prepare(...)` per invocation; preparing costs far more than the query.
Hot paths were moved off it (avatar-lookup.js), the rest still pays it (auth, profile, REST).
## Scope
1. Cache prepared statements per helper (lazy, module-level), no behaviour change.
2. Also note: `MAX_ROOMS` defaults to 50 (= 100 players) — confirm the production `.env` value against the 1000-player target.
## Done when
- Profile shows no per-call `prepare` on REST hot paths; tests green.
