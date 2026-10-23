# B351 — Login timing reveals whether a username exists
**Status:** OPEN
**Area:** server/routes/auth.js (POST /login), password hashing util
**From:** web-security-testing local probe, 2026-10-23   **Depends:** —

## Problem
Wrong-password login: existing user ≈ 102 ms, missing user ≈ 67 ms (6 samples each, local). Message is identical
(`INVALID_CREDENTIALS`), but the hash is only computed when the user exists. Password minimum is 6 chars (`PASSWORD_TOO_SHORT`).

## Scope
1. When user not found, run the same hash compare against a fixed dummy hash (same cost factor).
2. Re-measure with more samples; difference should be within noise.
3. Raising the minimum password length is a product decision: record in the fix-log, don't change here.

## Don't
- Don't change the error message or rate-limit config.

## Done when
- Timing gap gone locally; test asserts the compare runs for unknown users; `npm test` green.
