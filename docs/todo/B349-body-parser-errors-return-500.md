# B349 — Oversized / malformed JSON body returns 500 instead of 413 / 400
**Status:** OPEN
**Area:** server/middleware/errorHandler.js, server/index.js (express.json)
**From:** web-security-testing local probe, 2026-10-23   **Depends:** —

## Problem
`POST /api/auth/guest` with a 300 KB body → 500 `SERVER_ERROR`; `POST /api/auth/login` with `{bad` → 500.
Log shows `Unhandled error ... PayloadTooLargeError / SyntaxError`. body-parser errors carry `err.status`/`err.type`
but `errorHandler` only honours `err.statusCode` (AppError), so they fall through to 500 and pollute error logs.

## Scope
1. In `errorHandler`, map body-parser errors (`err.type` `entity.too.large` → 413, `entity.parse.failed` → 400) to a JSON error with a stable `code`.
2. Log them at warn/info, not error.
3. Regression test: oversized body → 413, bad JSON → 400, neither logged as error.

## Don't
- Don't change the `express.json()` size limit.
- Don't touch AppError handling.

## Done when
- Both requests return 4xx with JSON body; new server test passes; `npm test` green.
