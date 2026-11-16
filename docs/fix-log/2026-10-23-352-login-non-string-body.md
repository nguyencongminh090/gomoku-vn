# 2026-10-23 — #352 Login with non-string username/password returned 500
## Prompt
"fix the login type check" (from the local web-security-testing pass)
## Root cause
`POST /api/auth/login` only checked `!username || !password`. A JSON object/array/number is truthy, so `{"username":{"$ne":null}}` reached `db.getUserByUsername` as a bind value → better-sqlite3 `RangeError: Too few parameter values` → generic 500. Not injection (query is parameterized); `register` already validates types.
## Fix
`server/routes/auth.js`: require both fields to be non-empty strings, else the existing 400 `MISSING_CREDENTIALS` (code already has i18n). No other route changed.
## Verification
New `server/tests/auth-login-input-types.test.js` (5 cases: object/array/number username, object/number password): all failed before the fix; assert 400, no DB lookup, no bcrypt. Other routes with the same `!x` pattern not audited.
