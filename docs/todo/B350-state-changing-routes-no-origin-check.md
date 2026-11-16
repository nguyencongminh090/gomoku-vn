# B350 — No Origin / Sec-Fetch-Site check on cookie-authenticated state-changing routes
**Status:** ✅ FIXED 2026-10-23 (fix-log 2026-10-23-350-origin-guard)
**Area:** server/index.js, server/middleware/ (new), server/middleware/auth.js comment
**From:** web-security-testing local probe, 2026-10-23   **Depends:** —

## Problem
`POST /api/auth/logout` with `Origin: https://evil.example` + `Sec-Fetch-Site: cross-site` and a valid cookie → 204 (session revoked).
Only defence is `SameSite=Lax`. `middleware/auth.js` itself warns a second layer is needed. Only logout was probed; other POST/PUT/DELETE routes untested.

## Scope
1. Probe the other state-changing routes cross-site first (list which accept it).
2. Add one middleware before `/api/*`: for non-GET/HEAD/OPTIONS reject when `Sec-Fetch-Site` is `cross-site`, or `Origin` present and not same-origin / `CORS_ORIGIN` list (reuse `isAllowedOrigin`). Allow requests with neither header (curl, tests, OAuth callback is GET).
3. Regression tests: cross-site POST → 403; same-origin and header-less → pass.

## Traps
- Cloudflare tunnel: `Origin` host must be compared with the public host, not `localhost`; check `trust proxy` / `X-Forwarded-Host`.
- Playwright and jsdom tests send no Origin; don't break them.

## Don't
- Don't add token-based CSRF (cookie + SameSite + Origin check is enough here).

## Done when
- Cross-site mutation rejected on every `/api` write route; `npm test` and a real-browser login/logout pass.
