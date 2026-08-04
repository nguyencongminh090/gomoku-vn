# Fix log entry — 2026-08-01 22:30

## Prompt

Backend fix #1 (security review 2026-08-01): JWT dev secret still usable outside production — the guard in [server/config.js](server/config.js) only threw when `NODE_ENV === 'production'` exactly, so any host that starts the server without explicitly setting `NODE_ENV` (pm2/systemd/docker misconfiguration) silently falls back to the public dev secret `gomokuvn-dev-secret-change-in-production`, letting anyone who reads the repo forge a valid JWT for any userId.

## Action

Changed the guard in [server/config.js:44-46](server/config.js#L44-L46) from `NODE_ENV === 'production' && (missing or default secret)` to `NODE_ENV !== 'test' && JWT_SECRET === 'gomokuvn-dev-secret-change-in-production'` — now the dev secret is rejected in every environment except `test`, instead of being allowed everywhere except one specific string match.

## Decision

Allow-listed `test` explicitly rather than keeping a deny-list of `production`, since Jest sets `NODE_ENV=test` automatically (confirmed by a throwaway test asserting `process.env.NODE_ENV`) and every other environment (dev, staging, unset) is exactly where the forged-JWT exploit was demonstrated — a deny-list approach would need to enumerate every non-test environment name correctly, while the allow-list only needs the one Jest already guarantees. Local dev/staging runs will now need `JWT_SECRET` set explicitly (this is the intended behavior change, not a side effect).

## Summary output

`npm test`: 144/145 passing, same 1 pre-existing failure as baseline (`syncReadyWindow` mock, tracked separately as fix #9) — no new failures introduced by this change. Server module loads cleanly under Jest's `NODE_ENV=test`.
