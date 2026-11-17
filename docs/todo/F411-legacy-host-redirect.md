# F411 — Legacy-hostname redirect (play3cr.dpdns.org → play3cr.win)
**Status:** BUILT + DEPLOYED 2026-11-17, OPEN until a real installed PWA is checked
**Area:** server/middleware/legacy-host-redirect.js, server/index.js (mounted after accessLog), server/tests/legacy-host-redirect.test.js; VPS `.env` LEGACY_HOSTS / CANONICAL_ORIGIN
**From:** user 2026-11-17: "Người dùng đã cài app khi domain còn là play3cr.dpdns.org" → "Khuyên người dùng tải bản mới hoặc tự động cập nhật lại khi mở app (cập nhật địa chỉ sang play3cr.win)". **Depends:** —

## Problem
An installed PWA is bound to its origin, so installs from `play3cr.dpdns.org` cannot be re-pointed. After the cutover to the VPS the old domain still serves the app, but those users stay on the old origin.

## Scope
1. Middleware: when `Host` ∈ `LEGACY_HOSTS` and `CANONICAL_ORIGIN` is set, document navigations (GET/HEAD) get 302 to `CANONICAL_ORIGIN + originalUrl`. Done (ae772089, merged a1a3bd7e, deployed to VPS).
2. Left alone on the old host: `/api/*`, `/socket.io/*`, `/oauth-complete.html`, any non-document request (Sec-Fetch-Dest, else Accept text/html). No-op when env unset.
3. Open: check on a real PWA installed from dpdns (Android + iOS) that opening it lands on play3cr.win and the install banner appears there.

## Don't
- Don't redirect `/api`, `/socket.io`, `/oauth-complete.html`: open pages and an in-flight login on the old host must keep working.
- Don't use 301 (browsers cache it forever; the old domain may be reused).

## Traps
- `CORS_ORIGIN` is read by socket auth and origin-guard: every origin that serves the app must be listed, and env changes need `pm2 restart --update-env`.
- Without Sec-Fetch-Dest the fallback is `Accept: text/html`; fetch() with that Accept would be redirected too.
- Inside a standalone PWA a cross-origin navigation opens a browser frame, not the app window.

## Why this way
Server-side, so it covers every page and needs no `client/` change or `?v=` bump. Rejected: an in-page banner per page (not all pages load pwa-install.js; user would still have to act). Knowledge notes: none.

## Done when
- A PWA installed from play3cr.dpdns.org opens on play3cr.win on both Android and iOS (user check).
- Tests green (done: 5 cases in legacy-host-redirect.test.js; npm test 4258 passed).
