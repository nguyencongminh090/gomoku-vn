# 2026-10-23 21:51 — #349 Oversized / malformed JSON body returned 500
## Prompt
"Do #349"
## Root cause
`express.json()` errors carry `err.type` / `err.status`, not `err.statusCode`. `errorHandler` only honoured `AppError`, so they fell through to the generic 500 branch and were logged as "Unhandled error".
## Fix
`server/middleware/errorHandler.js`: map `entity.too.large` → 413 `PAYLOAD_TOO_LARGE`, `entity.parse.failed` → 400 `BODY_INVALID`, logged at warn. `client/js/i18n.js`: vi+en `err.payload_too_large` / `err.body_invalid` (required by error-codes-i18n-consistency test). `?v=` re-hashed. Body size limit and AppError path untouched. Branch fix/349-body-parser-errors off dev.
## Verification
New `server/tests/error-handler-body-parser.test.js` (3 tests): both 4xx cases fail without the fix, pass with it; unexpected error still 500. `npm test` 197 suites / 3526 pass; `cache-bust.js` OK. Not checked in a real browser.
