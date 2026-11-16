# 2026-11-16 08:16 — #394 logger: LOG_LEVEL + per-socket info lines → debug
**Cause:** logger ignored LOG_LEVEL; ~15 per-socket lines (grace start/cancel, rejoin, Timer start, stale socket) were info → sync console write per socket (~264 ms CPU in the 1k storm).
**Fix:** `logger.js` honours LOG_LEVEL=info|warn|error (default info). Owner call 2026-11-16: keep Connected/Disconnected, grace-expired, ROOM_GONE at info; the rest → debug. Regression: `logger.test.js` LOG_LEVEL block; 4 logger mocks gained `debug`. 4045 tests pass.
**Measured** (`mixed.sh`, LOG_LEVEL=info both, 1 run/side): server CPU 44 → 35 % of a core; ack p50 0.3→0.2, p99 18.1→32.5, max 221→326 ms (storm-second only, run-to-run noise 319–2098 ms storm time — unproven either way).
**Open:** ack tail → #397 (rule: ack outranks CPU). Logger-share profile not re-taken.
