# 2026-11-18 01:54 — #416 SW-proxied navigations get the #415 route cookie
## Prompt
"do #416" — returning users (sw.js installed) never got `gvn_sock`, so their socket stayed on Cloudflare.
## Root cause
`client/sw.js` answers every navigation with `fetch(e.request)`. That re-fetch drops the request's
destination, so the server saw `Sec-Fetch-Dest: empty` and `isDocumentRequest()` returned false.
Measured in Chromium 1243 (local probe server + the real sw.js): direct navigation = dest `document` /
mode `navigate`; SW-controlled reload and link navigation = dest `empty` / mode `navigate`, Accept
`text/html,…`; page `fetch()` = mode `cors`, Accept `*/*`. Set-Cookie on the SW-fetched response is
applied (probe cookie advanced on every proxied load). Fetch spec turns the mode into `same-origin`
(expected in Firefox/Safari — not measured).
## Fix
Server-side only (reaches users immediately, no SW update cycle): `server/socket/direct-route.js`
`isDocumentRequest` also accepts dest `empty` when Accept has `text/html` and mode is `navigate` or
`same-origin`. JS fetch/XHR stay excluded (mode `cors` or Accept `*/*`); iframes stay excluded.
sw.js untouched, offline fallback unchanged. The twin in `legacy-host-redirect.js` was left alone
(out of scope).
## Verification
direct-route.test.js: 2 SW shapes → nonce, 3 negatives (cors fetch of HTML, */* same-origin, iframe)
→ none; failed before the fix. `npm test` 4331 pass. NOT verified yet: prod "normal reload logs
`route=direct`" — needs deploy to the VPS.
## Prod verification (2026-11-18 02:00, after deploy da531aec)
curl on play3cr.win with a guest session: dest document/navigate, empty/navigate, empty/same-origin → `gvn_sock` set;
empty/cors → none. Real Chrome (logged in, VN): page SW-controlled, `location.reload()` with
navigation `workerStart > 0` (went through sw.js) → pm2 `Connected … route=direct`. Firefox/Safari not checked.
