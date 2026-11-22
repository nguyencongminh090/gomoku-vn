# B437 — `/vendor/socket.io/socket.io.min.js` has no `?v=`: stale bundle after a socket.io bump
**Status:** ✅ VERIFIED 2026-11-22 — deployed prod ad89d69a; Chrome: index + room (#43E, test room left) load socket.io.min.js?v=d5d79a35, socket connected over websocket, 0 console errors
**Area:** client/{index,room,tournament,tournament-match,diagnostic}.html, scripts/cache-bust.js, server/config/staticCache.js (`socketIoClientOptions`), server/index.js `/vendor/socket.io` mount
**From:** #436 deploy, 2026-11-22 ("okay, TODO for ?v=")   **Depends:** —

## Problem
The bundle URL is unversioned with `Cache-Control: public, max-age=86400`. After the #436 deploy (4.8.3 → 4.8.4)
Cloudflare edge kept serving 4.8.3 (cf-cache-status HIT, age ~5 h) until a manual purge; browsers keep their
own copy up to 24 h. A protocol-breaking bump would mismatch client and server for a day.

## Scope
1. Version the 5 `<script src="/vendor/socket.io/socket.io.min.js">` refs (content hash of
   `socket.io/client-dist/socket.io.min.js`, same as other `?v=`), written by `cache-bust.js --write` and checked by its verify.
2. Once versioned, serve `?v=` requests `immutable` (like other hashed assets); keep the unversioned URL working (old cached HTML).
3. Update the tests that match the exact src string (client/tests/room-early-socket, socket-early-connect;
   server/tests/socket-io-client-cache) to accept `?v=`.
4. `npm test`; real-browser load of index + room; after deploy, public URL serves the new hash.

## Don't
- Don't copy the bundle into `client/` (two sources; it must come from the installed `socket.io` package).
- Don't drop the legacy `/socket.io/socket.io.min.js` serveClient path.

## Traps
- cache-bust.js resolves `/x` relative to `client/`; `/vendor/socket.io/*` is not under `client/` → today it
  would FAIL as unresolvable; needs an explicit mapping to `node_modules/socket.io/client-dist/`.
- The hash changes only on `npm ci`/install, which a plain client edit doesn't trigger — verify must still
  catch a bump (a test like `server/tests/socketio-versions.test.js`).
- Early Hints / preload (#410) may list the bundle: check `Link` headers carry the same `?v=`.

## Done when
- All 5 pages reference `/vendor/socket.io/socket.io.min.js?v=<hash>`; `node scripts/cache-bust.js` OK; tests green.
- Bumping socket.io and re-running `--write` changes the hash (asserted by a test).
