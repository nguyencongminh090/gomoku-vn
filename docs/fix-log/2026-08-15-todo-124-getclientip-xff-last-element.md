# Fix log entry — 2026-08-15 12:06

## Prompt

Do #124.

## Action

Changed `server/utils/get-client-ip.js:48`'s `X-Forwarded-For` fallback branch from
`forwarded.split(',')[0].trim()` (first element, most spoofable) to
`forwarded.split(',').pop().trim()` (last element) per `docs/instruction/B124-*.md`. Exactly 1 line;
left the `CF-Connecting-IP` priority branch and the loopback-peer condition untouched.

Updated `server/tests/get-client-ip.test.js`: two existing multi-value-XFF cases previously asserted
the first element (`198.51.100.5`) — updated both to assert the last (`10.0.0.1`), and added a new
dedicated case (`"1.1.1.1, 10.0.0.5"` → `"10.0.0.5"`) per the instruction doc's exact test spec.
Checked `server/tests/LobbyHandler.test.js` (also exercises `getClientIp`) and
`server/tests/auth-rate-limit-ip.test.js` (shares the rate-limit-IP logic per B92/B93) — neither uses
multi-value XFF, so both are unaffected by the change.

## Decision

Followed `docs/instruction/B124-*.md` verbatim — no deviation. Branching: `TODO.md #124`'s entry is
absent on `main` (`git show main:TODO.md | grep '#124'` empty, and `get-client-ip.js` on `main` still
has the old `[0]` fallback) so per `git-workflow` skill's exception rule this fix branches off `dev`
and merges back into `dev` only, not `main`.

## Summary output

`server/tests/get-client-ip.test.js` + `server/tests/LobbyHandler.test.js`: 29/29 pass. No
`client/css/`/`client/js/` touched, so no `?v=N` bump needed. `fix/getclientip-xff-last-element` off
`dev`.
