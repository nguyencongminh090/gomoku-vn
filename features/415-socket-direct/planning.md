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
   (default `VN`) + live session → sets `gvn_sock={u, n}` (host-only, SameSite=Strict, JS-readable, **60 s**).
   Ineligible → cookie cleared. HTML is `cf-cache-status: DYNAMIC` (checked) so a per-user cookie is never cached.
2. **Credentials, two stages** (🟠 cookie risk + security-review finding solved) — JS never holds a replayable
   credential:
   - `n` = one-time nonce: AES-256-GCM over `{kind, session, country, exp 60 s, id}`, key = HKDF(JWT_SECRET),
     **single use** (in-memory used-set; restart bounded by the 60 s expiry). Sent once as `?gvn_n=`.
   - The first direct handshake consumes it and answers with **`gvn_dt`: HttpOnly, host-only on the direct host,
     `Path=/socket.io/`, SameSite=Lax, sliding 24 h** (`initial_headers`). Reconnects/other pages/tabs use it.
   - Every handshake re-checks the session row → logout/kick/lock end the direct path too. The session cookie
     stays host-only on play3cr.win → `dev.play3cr.win` never sees prod sessions.
   - First version (commit 471c222d) put a 30-min ticket in a JS-readable cookie + refreshed it over the socket →
     an XSS could take the socket off-site and keep it alive indefinitely. Replaced.
   - Residual: an XSS that wins the race for the 60 s nonce gets ONE direct session on its own client (victim's
     page then falls back to CF). Equivalent to what in-page XSS can already do; not bound to IP on purpose
     (CF path may be IPv6, direct is IPv4-only).
   - Needs same-site hosts (play3cr.win ↔ direct.play3cr.win): in a cross-site setup the browser drops the
     cookie → reconnect fails → CF fallback (verified, harmless).
3. **Trust = listener port** (🔴 spoofing solved) — `engineMiddleware` deletes every `cf-*` header on port 3001
   before auth reads it; IP comes from Caddy's XFF via loopback; country from the token. Port 3000 unchanged.
   Port 3001 serves only socket.io (`expressGuard` 404). Tests: forged `CF-Connecting-IP`/`CF-IPCountry` ignored.
4. **Client** (`socket-client.js`) — cookie → `io(url, {query:{gvn_n}, timeout: 4 s})`; else `io(opts)` exactly as
   before. Fallback re-points the ONE Manager (`socket.io.uri = origin`), never a second socket: on `AUTH_TICKET`
   (any time; this page only — next page load gets a fresh nonce), first connect failure, or 5 failed
   reconnects in a row after having connected; a path failure keeps the tab on CF for 15 min
   (`sessionStorage.gvn_sock_off` timestamp). `AUTH_TICKET` never logs the user out.
5. **CSP** — `connect-src` gets the direct origin (+ wss) only when enabled. (Missed by jsdom; the real-browser
   pass caught it.)
6. **Log** — `[Socket] Connected … route=direct` → compare real users' behaviour per route.
7. **Rollback** — unset `DIRECT_SOCKET_URL` + restart → byte-identical to today; tabs holding a stale cookie
   (≤ 60 s) fail the direct attempt and fall back. Or just delete the DNS record (fallback, no restart).

## Verified
- `npm test` 4314/4314 green; new `server/tests/direct-route.test.js` (ticket, cookie decision table, 2-listener
  integration incl. spoofing, CSP) + `client/tests/socket-client-direct-route.test.js` (route choice, fallback).
- Real Chromium, local server, temp DB: guest → index → WS to the direct port, server log `route=direct`;
  direct host dead → same socket falls back to origin, connected, one socket.
- Real Chromium over TLS, same-site hosts (`app.gvn.test` / `direct.gvn.test`, self-signed): Chrome stores `gvn_dt`
  from the WS handshake (HttpOnly, invisible to JS); forced transport drop → reconnect with the spent nonce
  succeeds on the cookie (`route=direct`, `reconnect=1`, 0 rejections). Cross-site (`*.localhost`) → cookie
  dropped → graceful CF fallback.

## NOT verified / still open
- No Caddy/TLS/DNS in the loop (local run went browser → :3101 straight).
- Safari/iOS storing a cookie from a WS handshake (Chrome verified only). If it doesn't: each new page still
  goes direct via its nonce; only reconnects within a page fall back to CF.
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

## Hide the VPS IP (user 2026-11-17: "No" to exposing it → research)
Measured from the PC (Viettel), 23:44 +07, 30 fresh TLS GETs + 100 pings each:
| Edge | IP | TCP connect p50 / p90 / max | ICMP loss | Note |
|---|---|---|---|---|
| Cloudflare free (play3cr.win) | 104.21.15.100 | 55 / 1069 / 1091 ms | 20 % | the problem |
| **AWS CloudFront** | 108.157.34.x | **9 / 29 / 30 ms** | **0 %**, rtt 7 ms | edges in Hanoi + Saigon (AWS, 2022) |
| Gcore | 92.223.95.95 | 54 / 1072 / 4154 ms | — | same loss pattern → out |
| Bunny | 156.59.241.114 | 27 / 30 / 74 ms | 0 % | SG, paid only |
| Fastly | 151.101.x | 90 / 100 / 105 ms | — | far, WS paid |
| Akamai | 171.242.7.x (in Viettel) | 7 / 9 / 37 ms | — | enterprise only |
| VPS direct | 157.66.101.59 | 7-16 ms | 0 % | needs IP exposed |

Options, no IP in public DNS (the code above already fits them: trust-by-port, only the header source changes):
- **C1 CloudFront → Cloudflare (recommended to try first):** `direct.` = CloudFront distribution, origin =
  a CF-proxied hostname whose tunnel ingress → 127.0.0.1:3001. VPS IP never published, no Caddy, no ufw change.
  Lossy Viettel→CF leg replaced by Viettel→AWS VN (0 %) + AWS→CF (backbone peering, unmeasured).
  Expected RTT ~40-70 ms (vs 9 ms direct, vs 374 ms p50 today) — unmeasured until a distribution exists.
  Real IP: CF-Connecting-IP becomes a CloudFront IP → on :3001 take `CloudFront-Viewer-Address`, accepted only
  with a secret custom origin header (else anyone can go CF→:3001 and forge it). Needs a custom origin
  request policy → **pay-as-you-go** (always-free 1 TB + 10M req/month), not the flat-rate Free plan
  (custom origin request rules: Business+). Needs an AWS account (card).
- **C2 CloudFront → VPS:** origin = unlisted hostname → VPS, Caddy, ufw 443 only from CloudFront's
  origin-facing prefix list + secret header. ~10-15 ms. IP still findable (CT log of the origin cert name),
  but only reachable from CloudFront; a volumetric flood on the IP stays possible.
- **C3 Sacrificial relay VPS in VN:** cheap 2nd VPS runs Caddy, tunnels to origin (WireGuard); only the relay IP
  is public. Relay flooded → clients fall back to CF, origin unaffected. +1 small bill, other ISPs unmeasured.
- Rejected: Caddy on the origin with a DNS-only record (user: no); Gcore (same loss); Cloudflare-only tricks
  (Workers/Spectrum/for-SaaS share the same free IP ranges or need Enterprise). "Check with Cloudflare" for
  other ISPs: CF has no path-measurement tool for a free zone → skipped; `route=direct` logs after rollout instead.
Sources: AWS CloudFront pricing / flat-rate plan docs, AWS "new edge locations in Vietnam" (2022-08),
CloudFront WebSocket + CloudFront-Viewer-Address docs.

## C1 set up 2026-11-18 00:10-00:30 (user picked C1; nothing deployed yet)
- AWS account 850470019077 (user signed up). ACM us-east-1 cert `direct.play3cr.win` (2389208a…, DNS-validated;
  CF record `_d88d1210….direct` kept for renewal). CloudFront `E1086MRYTD5H5E` = `d3fkrz3mmqf6p0.cloudfront.net`,
  **flat-rate Free plan ($0, no overage)** — PAYG rejected: uncapped bill under a flood. Free plan = managed
  policies only: CachingDisabled + AllViewerExceptHostHeader; origin `cfo-d2dc719b4571.play3cr.win` HTTPS-only,
  custom header `X-Gvn-Edge` (secret pasted by the user; VPS copy `~/.gvn-edge-secret`, PC copy scratchpad).
  WAF rate limit 300 req/5 min/IP. Unused custom policy `gvn-socket-direct` left (Business-only).
- Cloudflare: proxied CNAME `cfo-d2dc719b4571` → tunnel GomokuVPS, ingress → `http://localhost:3001`;
  DNS-only CNAME `direct` → CloudFront. Prod hostnames untouched (verified 200).
- Chain check (temp echo on VPS :3001, removed): secret matches; `CloudFront-Viewer-Address` forwarded by the
  managed policy and overwrites a forged one; Host rewritten to origin; Origin kept; XFF
  `forged, viewer, cloudfront`. Edge POP HAN50, ping 27 ms 0 % loss. WS upgrade not testable with the echo (502).
- To enable: VPS `.env` += `DIRECT_SOCKET_URL=https://direct.play3cr.win DIRECT_SOCKET_EDGE=cloudfront
  DIRECT_EDGE_SECRET=<~/.gvn-edge-secret>`; merge feature → dev, push, `update-gomoku.sh` (restart: rooms lost).
  Then measure `/diag` RTT via direct.play3cr.win (diag namespace has no auth) and watch `route=direct`.
- Rollback: drop the env lines + restart, or delete the `direct` CNAME (clients fall back to CF).

## Deployed 2026-11-18 00:57 (dev aad8b8fd) — C1 works but routes via the US
- Works: route cookie on HTML (VN), nonce → direct WS connect, replay → AUTH_TICKET, normal CF path + AUTH_ORIGIN intact.
- WAF trap: CloudFront's managed rules 403 any request **without User-Agent** (node test clients); browsers unaffected.
- Problem: CloudFront edge (HAN50 / SGN50) reaches Cloudflare at **LAX / ATL** (`cf-ray` suffix), then tunnel →
  SIN → VPS. Measured 01:00 (off-peak, CF currently clean): direct WS handshake p50 1922 ms vs CF 361; emit RTT
  p50 158 / p99 363 ms vs CF 79 / 86. At peak CF was 374 / 4379 → direct still avoids multi-second stalls, but
  is slower off-peak. Fix = take Cloudflare out of the chain: CloudFront → VPS directly (C2, firewall 443 to
  CloudFront origin-facing ranges), or a relay.
