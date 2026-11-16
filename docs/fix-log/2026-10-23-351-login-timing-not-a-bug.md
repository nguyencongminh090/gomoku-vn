# 2026-10-23 23:19 — #351 Login timing user enumeration: not a bug (correction of my probe)
## Prompt
"Do #351"
## Root cause
None. `POST /login` already runs one `bcrypt.compare` against `DUMMY_PASSWORD_HASH` (cost 12 = `BCRYPT_ROUNDS`) for unknown users (commit 985c9c4, test `auth-login-timing.test.js`). The 102 ms vs 67 ms in the 2026-10-23 probe was a measurement artifact: all requests came from one IP, so part of the samples hit the auth rate limiter (fast 429) and skewed the averages.
## Fix
No code change. Closed #351; #349 and #350 are unaffected.
## Verification
Re-measured on an isolated server (temp DB), 20 samples each, distinct X-Forwarded-For per request so no 429: all 401; existing user median 186.6 ms / avg 188.4, unknown user median 187.8 / avg 189.8 (~1 ms apart, noise). Password minimum length (6) is a separate product decision, not changed.
