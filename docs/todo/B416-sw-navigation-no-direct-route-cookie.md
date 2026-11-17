# B416 — Service-worker navigations never get the #415 route cookie
**Status:** FIXED on fix/416-sw-navigation-route-cookie (server-side); prod check pending deploy
**Area:** server/socket/direct-route.js (`isDocumentRequest`), client/sw.js, server/tests/direct-route.test.js
**From:** browser check 2026-11-18 01:49 after C2 went live   **Depends:** #415

## Problem
Returning users have `sw.js` installed; it proxies every navigation with `fetch(e.request)`. That
request reaches the server without `Sec-Fetch-Dest: document`, so `isDocumentRequest()` is false →
no `gvn_sock` nonce → socket stays on Cloudflare. Verified in Chrome (logged in, VN): normal reload →
no cookie, pm2 `Connected` without `route=direct`; Ctrl+Shift+R (bypasses SW) → cookie set,
`route=direct`. So almost no real user gets the direct path today.

## Scope
1. Confirm the exact headers of a SW-proxied navigation (Sec-Fetch-Dest/Mode, Accept) on a real browser.
2. Make the server recognise it (e.g. Accept `text/html` + Sec-Fetch-Mode `navigate|same-origin`), or
   have sw.js keep the navigation untouched; pick the smaller, keep JS fetch()/XHR excluded.
3. Regression test in direct-route.test.js for the SW header shape.

## Don't
- Don't issue nonces on API/XHR responses. Don't break the offline fallback in sw.js.

## Traps
- Changing sw.js needs cache-bust + SW update cycle; server-side fix reaches users immediately.

## Done when
- Normal reload on a SW-controlled page logs `route=direct`.
