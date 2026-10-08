---
name: static-assets-caching-csp-build
description: Rules for how gomoku-vn serves static assets (cache headers, compression, socket.io client, Cloudflare edge), the helmet CSP and its inline-handler fallout, the retired dist/ build, and the ?v=N module-instance trap.
domain: gomoku-vn
tags: express-static,cache-control,compression,csp,helmet,cloudflare,vite-dist,cache-busting
apply_when: "Changing server/index.js static serving, server/config/csp.js or staticCache.js, adding a script/inline handler/third-party host, running a build, or bumping ?v=N."
sources: "2026-08-08-todo-65-csp-third-party-script, 2026-08-08-todo-65-csp-production-build-gaps, 2026-08-08-todo-72-room-settings-csp-onchange-blocked, 2026-08-12-todo-105-compression-middleware, 2026-08-12-todo-106-static-cache-control, 2026-08-12-todo-106-verification-through-cloudflare, 2026-08-12-todo-107-socket-io-min-js, 2026-08-12-todo-109-remove-stale-dist-branch, 2026-08-12-todo-111-socket-io-client-cache-control, 2026-08-12-todo-112-csp-cloudflare-insights, 2026-08-21-todo-133-vong-4-quen-bump-v-sau-merge, 2026-08-21-todo-136-tab-activation-vs-drawer-toggle, TODO #65 #72 #105 #106 #107 #109 #111 #112 #125 #136"
last_reviewed: 2026-10-09
confidence: high
---
# Static assets, caching, CSP and the build

## Why this note exists
CSP hardening (#65) silently broke inline handlers (#72) and a stale `dist/` made the strict CSP break production; the `?v=N` rule was missed on cross-imports twice (duplicate sockets, #136) and once after a merge. Each looked fine in dev.

## Facts and rules
1. `server/index.js` always serves `client/` (`clientPath`). The `NODE_ENV=production` -> `dist/` branch was removed (#109); `server/tests/client-path.test.js` guards it. `npm run build`/`vite.config.js` still exist but their output is not served.
2. `server/config/staticCache.js`: `*.html` -> `no-cache`, everything else -> `public, max-age=31536000, immutable` (#106). The SPA catch-all (`res.sendFile(login.html)`) bypasses `express.static` `setHeaders`, so it sets `no-cache` explicitly.
3. Because assets are `immutable`, any change under `client/css/` or `client/js/` must bump `?v=N` everywhere (see CLAUDE.md and `.claude/rules/cache-busting.md`).
4. After a dev/main merge conflict on `?v=N`, re-bump to max(dev, main)+1 even when file content merged differently; keeping the same number served stale `board.js` (#133 round 4).
5. `app.use(compression())` sits after `helmet()` and before `express.static` (#105). Do not touch socket.io `perMessageDeflate`.
6. socket.io client is served from `/vendor/socket.io/socket.io.min.js` via `socketIoClientOptions` (`public, max-age=86400`), not `/socket.io/`. engine.io swallows every `/socket.io/*` request (Express middleware never sees it, even with `serveClient: false`) and hardcodes `max-age=0`. Resolve the dir via `require.resolve('socket.io/package.json')` (`./client-dist` is not in `exports`). No `?v=N` on it.
7. CSP lives in `server/config/csp.js`. `scriptSrc` is `'self'` + `CF_INSIGHTS_SCRIPT`; `connectSrc` is `'self'` + `CF_INSIGHTS_REPORT`. These are two different hosts (`static.cloudflareinsights.com` loads the beacon, `cloudflareinsights.com` receives data); allowlisting only the script host leaves analytics dead. No wildcards.
8. `scriptSrcAttr: ["'none'"]` blocks every inline `onclick=`/`onchange=` attribute. Use `data-action`/`data-arg` handled by `client/js/action-delegate.js` (click and change listeners). No inline `<script>`; theme/ui-mode preloads are files in `client/js/`.
9. Icons are self-hosted under `client/vendor/phosphor/`; no third-party script tags.
10. Cloudflare drops the `ETag` of HTML when it recompresses (#125, dashboard setting "Respect Strong ETags", not code). `If-Modified-Since` still yields 304. `index.html` showing `cf-cache-status: DYNAMIC` is by design.
11. Every module under `client/js/` (incl. `client/js/diag/`) imports siblings with the same `?v=N`; a stale one makes a second module instance run top-level code again. Guard listener binding with a flag (`document.body.dataset.roomTabsBound` in `room.js`).

## Symptom -> real cause -> fix
| Symptom | Real cause | Fix |
|---|---|---|
| Room Settings radios "snap back" (#72) | CSP `scriptSrcAttr 'none'` blocked inline `onchange` | delegated `change` listener in `action-delegate.js` (all 18 controls) |
| Prod pages 404/blank after CSP (#65) | stale gitignored `dist/` plus Vite not copying classic scripts | superseded: `dist/` no longer served (#109) |
| Profanity filter silently off in a Vite build | UMD modules wrapped lazily; globals never attached | load as classic `<script>` tags |
| Analytics beacon loads but no data (#112) | `connect-src` missing report host | pin `CF_INSIGHTS_REPORT` |
| Tab click collapses drawer / kicked to login (#136) | duplicate module instance bound handler twice | binding guard plus `activateTab()` that never touches the drawer |
| Fix merged but live board unchanged | `?v=` not re-bumped | bump all, run the grep check |

## Verify before calling it fixed
- `grep -rn "?v=" client/*.html client/js/ | grep -v mockup | grep -o "?v=[0-9]*" | sort -u` shows exactly one value.
- `npx jest server/tests/static-cache-control.test.js server/tests/compression.test.js server/tests/csp.test.js server/tests/client-path.test.js`.
- Compression/304 tests use raw `http`, not `fetch` (undici decompresses, strips `Content-Encoding`, and caches 304 to 200).
- Wiring asserts on source text must strip comment lines first, else comments match (found twice, #105/#109). Mutation-check them.
- Real browser: look for CSP violations in the console; `curl -I` origin and through the domain (`cf-cache-status` HIT on 2nd request). Use a throwaway DB (`playwright-e2e-safety`).
- socket.io from `http://localhost:3000` is refused when `.env` sets `CORS_ORIGIN` to the real domain.

## Do not use when
Pure game logic, auth cookies (see `auth-session-oauth.md`), or board visual design.

## Related
`perf-http-caching-cdn.md`, `appsec-xss-csrf.md`; TODO #65 #72 #105 #106 #107 #109 #111 #112 #125 #136.
