# Fix log entry — 2026-08-01 22:30

## Prompt

Backend fix #8 (security review 2026-08-01): the server shipped with zero HTTP security headers — measured via `curl` against the running dev server, all 5 of `content-security-policy`, `x-frame-options`, `x-content-type-options`, `strict-transport-security`, `referrer-policy` were absent, and `X-Powered-By: Express` leaked the stack. `login.html` could be iframed by any origin (clickjacking).

## Action

`npm i helmet`; added `app.use(helmet({ contentSecurityPolicy: false }))` to [server/index.js](server/index.js), right after `const app = express()` and before any route/static mounting. CSP was explicitly disabled rather than left at helmet's default.

## Decision

Before enabling helmet's default CSP, grepped the client for what it would break: `client/*.html` has 4 inline `<script>` blocks (the pre-paint theme/UI-mode init IIFEs noted in this log's "Phase 2 infrastructure" entry) and 18 inline `style="..."` attributes across the CSS files — helmet's default `script-src 'self'` / `style-src 'self'` would block all of them with no nonce/hash wiring in place. Rather than either shipping a broken CSP or skipping the header family entirely, kept the other 4 headers (which have no inline-content interaction) and deferred CSP specifically, with a comment in `index.js` explaining why and pointing at this log entry. Wiring a real CSP (nonces on the inline scripts, hashing the inline styles) is future work, not silently dropped.

## Summary output

Started the real dev server (`JWT_SECRET=<local-only> PORT=3099 npm start`) and `curl -I`'d it: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security: max-age=31536000; includeSubDomains` all present; `X-Powered-By` gone; no `content-security-policy` header (expected, deliberately off). Fetched `index.html`, `room.html`, `login.html`, `history.html`, `js/index-entry.js`, `css/main.css` — all `200`, correct `Content-Type` on the JS/CSS assets, nothing blocked (no CSP header to block anything). Server and its temp `server/db/gomoku.db` (created fresh by this manual run, gitignored via `*.db`, deleted after) were both cleaned up. `npm test`: 145/145 passing.
