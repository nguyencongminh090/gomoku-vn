# Fix log entry — 2026-08-03 00:55

## Prompt

User asked directly whether `MAX_ROOMS`/`MAX_USERS_PER_ROOM` could be raised, after being told the 200-total-room-member cap (`MAX_ROOMS=10 × MAX_USERS_PER_ROOM=20`) was an abuse-prevention choice, not a capacity one (`docs/stress-test-report.md` §8 — the server itself is verified clean up to ~3000-4000 concurrent players). User picked the target numbers: `MAX_ROOMS=50`, `MAX_USERS_PER_ROOM=40` (2000 total room-members).

## Action

Changed the defaults in [server/config.js](server/config.js) (10→50, 20→40), with a comment explaining the abuse-vs-capacity distinction and pointing at the measured ceiling. Deliberately left `MAX_ROOMS_PER_IP` at 3 — not requested, and a 3-room quota is proportionally *tighter* abuse protection against a 50-room pool (6%) than it was against the original 10-room pool (30%), so leaving it alone doesn't weaken anything. Fixed a now-stale comment in [server/managers/RoomManager.js](server/managers/RoomManager.js) that hardcoded "MAX_ROOMS is 10". Updated the env-var reference tables in [README.md](README.md) and [scripts/capacity-test/README.md](scripts/capacity-test/README.md), which described the old defaults as current fact.

## Decision

Flagged the `MAX_ROOMS_PER_IP` question to the user before touching anything (raising the pool without revisiting its ratio to the per-IP quota is a policy call, not something derivable from capacity data alone) — they didn't ask for it changed, so it stayed at 3.

## Summary output

`npm test`: 324/324 passing (was 313). New [server/tests/room-capacity-config.test.js](server/tests/room-capacity-config.test.js) (8 cases, same pattern as `listen-backlog.test.js`: pins the new 50/40 defaults, env overrides, invalid-input fallback, and that `MAX_ROOMS_PER_IP` stayed unscaled). Added a new `RoomManager.test.js` describe block (3 cases) for the total `MAX_ROOMS` cap itself, which had **no prior test coverage at all** despite being the first check `createRoom()` runs (only `MAX_ROOMS_PER_IP` had tests) — fills the pool across enough distinct IPs to avoid tripping the per-IP quota, confirms the next room from a brand-new IP is still refused, and confirms destroying one room frees a slot. Mutation-checked: reverting `config.js` failed exactly the 5/8 new-file tests that assert the specific literal values, left the relative-comparison tests green — confirming the tests catch the real value, not just generic behavior. **Load-verified against a real running server with real sockets** (not just the RoomManager unit tests): one host created a room, 40 JWT-minted guests joined in sequence — exactly 39 succeeded (host + 39 = 40 = cap) and the 40th was cleanly rejected with "Phòng đã đầy.", matching the predicted boundary exactly.
