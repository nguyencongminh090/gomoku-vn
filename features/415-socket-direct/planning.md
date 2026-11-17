# #415 socket-direct — proposal + PoC (2026-11-17)
Links: [user_story](user_story.md) · [sequence](diagram/uml_diagram/socket-route.md) · [Caddyfile](Caddyfile)

Todo: `docs/todo/B415-prod-lag-viettel-cloudflare-loss.md` (problem, options, risks). This folder = the chosen
design (option B, VN only) as working code on `feature/415-socket-direct`, **flag off by default**, nothing
deployed, no DNS/Caddy/ufw change made.

## Measurement (PC on Viettel → VPS, 2026-11-17 23:28 +07, `/diag` namespace, no auth)
| Path | WS handshake p50 / p90 / max | emit→reply RTT p50 / p90 / p99 / max | RTT > 1 s |
|---|---|---|---|
| `wss://play3cr.win` (Cloudflare) | 618 / 1241 / 1658 ms (1/20 failed) | 374 / 1088 / 4379 / 5740 ms | 33 / 300 |
| direct to VPS (ssh `-L`, same network path as a DNS-only host) | 84 / 89 / 90 ms * | 9 / 10 / 14 / 18 ms | 0 / 300 |
\* includes ssh channel setup. 23:28 is past the 21:00 peak, still bad → not a peak-only problem.
IPv6: play3cr.win has AAAA (2606:4700:…), but this PC has no IPv6 route → v4 numbers are what it uses;
a Viettel user WITH IPv6 may take a different path (unmeasured).

## Design (what the code does)
```
page/REST:  browser ─► Cloudflare ─► cloudflared ─► node :3000      (unchanged)
socket:     browser ─► direct.play3cr.win (DNS-only) ─► Caddy :443 ─► node 127.0.0.1:3001 (same http.Server)
```
1. **Who goes direct** — `routeCookieMiddleware`: page navigation via CF, `CF-IPCountry ∈ DIRECT_SOCKET_COUNTRIES`
   (default `VN`) + live session → sets `gvn_sock={u,t}` (host-only, SameSite=Strict, JS-readable, 30 min).
   Ineligible → cookie cleared. HTML is `cf-cache-status: DYNAMIC` (checked) so a per-user cookie is never cached.
2. **Ticket, not cookie** (🟠 cookie risk solved) — AES-256-GCM over `{sessionId, country, exp}`, key = HKDF(JWT_SECRET).
   Session id never visible; every handshake re-checks the session row → revoke/kick/lock still work; survives
   restarts (stateless). Refreshed over the direct socket (`route:ticket`, every TTL/3) → no extra CF request.
   The session cookie stays host-only → `dev.play3cr.win` never sees prod sessions.
3. **Trust = listener port** (🔴 spoofing solved) — `engineMiddleware` deletes every `cf-*` header on port 3001
   before auth reads it; IP comes from Caddy's XFF via loopback; country from the ticket. Port 3000 unchanged.
   Port 3001 serves only socket.io (`expressGuard` 404). Tests: forged `CF-Connecting-IP`/`CF-IPCountry` ignored.
4. **Client** (`socket-client.js`) — cookie → `io(url, {auth:{ticket}, timeout: 4 s})`; else `io(opts)` exactly as
   before. Fallback re-points the ONE Manager (`socket.io.uri = origin`), never a second socket: on `AUTH_TICKET`
   (any time; this page only — next page load gets a fresh ticket), first connect failure, or 5 failed
   reconnects in a row after having connected; a path failure keeps the tab on CF for 15 min
   (`sessionStorage.gvn_sock_off` timestamp). `AUTH_TICKET` never logs the user out.
5. **CSP** — `connect-src` gets the direct origin (+ wss) only when enabled. (Missed by jsdom; the real-browser
   pass caught it.)
6. **Log** — `[Socket] Connected … route=direct` → compare real users' behaviour per route.
7. **Rollback** — unset `DIRECT_SOCKET_URL` + restart → byte-identical to today; tabs holding a stale cookie
   (≤ 30 min) fail the direct attempt and fall back. Or just delete the DNS record (fallback, no restart).

## Verified
- `npm test` 4310/4310 green; new `server/tests/direct-route.test.js` (ticket, cookie decision table, 2-listener
  integration incl. spoofing, CSP) + `client/tests/socket-client-direct-route.test.js` (route choice, fallback).
- Real Chromium, local server, temp DB: guest → index → WS to the direct port, server log `route=direct`;
  direct host dead → same socket falls back to origin, connected, one socket.

## NOT verified / still open
- No Caddy/TLS/DNS in the loop (local run went browser → :3101 straight).
- Direct = websocket only in practice: polling to `direct.` is cross-origin and socket.io's `cors.origin` is the raw
  comma string from CORS_ORIGIN (not an array) → browser likely blocks it → that client falls back to CF. Fine
  for the PoC; split it into an array if polling-over-direct is wanted.
- A full game (moves, clock, reconnect mid-game, deploy restart) over the direct route.
- VNPT / FPT / 4G → VPS (AS135918) paths; IPv6 users; foreign users stay on CF (by design, unmeasured).
- Per-IP limits on :443 (nftables proposal) not written. VPS IP exposure accepted? — user decision.

## Rollout if approved
1. User OK on exposing the VPS IP. 2. Install Caddy (apt), this Caddyfile, ufw 443 (+80 or DNS-01).
3. DNS-only A `direct.play3cr.win`. 4. Merge to dev, deploy with `DIRECT_SOCKET_URL` + restart (warn: rooms lost).
5. Watch `route=direct` vs CF connects/disconnects for a few days; ask VN players on other ISPs.
