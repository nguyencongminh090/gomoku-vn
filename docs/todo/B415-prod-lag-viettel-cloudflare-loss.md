# B415 — Prod lag: Viettel → Cloudflare free-plan IPs drop packets (undecided fix)
**Status:** OPEN — root cause found 2026-11-17, solution recorded, user has NOT decided
**Area:** VPS (Caddy, ufw), Cloudflare DNS for play3cr.win, `server/utils/geo.js`, `server/socket/state.js`, `trust proxy` in `server/index.js` / `routes/auth.js` / `utils/session-cookie.js`
**From:** user 2026-11-17 "web is a bit lag" + "nhiều người khác cũng báo cáo tương tự"   **Depends:** —

## Problem
Measured 2026-11-17 ~21:00 +07 from the PC (AS7552 Viettel). VPS idle (load 0, origin TTFB p50 3 ms); tunnel healthy (SIN, QUIC RTT 29-44 ms, 0 loss).
- play3cr.win IPs 104.21.15.100 / 172.67.162.39 (CF free shared range): ICMP 37% loss, TCP connect p90 1-2 s, max 7 s (SYN retransmits); GET / p50 0.57 s, p90 3.1 s. Cached static HITs equally slow → not the origin. mtr: loss starts at Viettel hops 11-15.
- Same request forced to 104.16.123.96 (CF's own range, same SIN colo): 0% loss, connect 34 ms, GET / p50 0.13 s.
- PC → VPS direct (AS135918, in VN): TCP connect 7-16 ms, 10/10 OK. VPS → 104.21.15.100: 3% loss.
- Direction (kernel TCP counters, PC): upload 10×256 KB → 997/2203 segs retransmitted (~45%) vs 4/2067 on 104.16; download shows OFO 22 / DSACK 16 → loss both ways, send side far worse (moves are sends).
- Not origin- or domain-specific: user confirmed app on PC via dev.play3cr.win (same IPs) lags too; play3cr.dpdns.org (other zone/TLD, 104.21.11.251 / 172.67.150.225) 37% / 27% loss. A new domain on CF Free would land in the same ranges.
- Direct path TCP (PC ↔ VPS via ssh, 4×2.5 MB each way): upload 2/7416 segs retransmitted (~0.03%); download OFO 19 (loss vs reorder not separated). Same signature already seen 2026-08 on the PC host (#131: WS 7-44 s, ~17% ISP loss) → long-standing, now worse.
Not measured: VNPT / FPT / mobile, off-peak hours.

## Options (user leans to B, 2026-11-17; limits/risks not yet discussed)
- **A. Whole site direct:** grey-cloud play3cr.win → VPS + Caddy. Fixes page + socket; loses CF protection.
- **B. Socket-only direct (preferred):** page/REST stay on CF; `io('https://direct.play3cr.win')` in `client/js/socket-client.js:99`. Needs Caddy + DNS-only `direct.` host, session cookie `Domain=play3cr.win` (now host-only, `utils/session-cookie.js`), CORS_ORIGIN, IP from X-Forwarded-For. Hybrid "tick slow network in Settings" variant was considered; B chosen as lighter (no host switch, no localStorage/PWA loss).
- **B effect, moves (main goal):** all moves/clock/room chat/presence/reconnect ride the one WS → off the lossy leg; expect RTT ~10-20 ms vs ~55 ms + 1-3 s TCP head-of-line stalls; WS handshake tens of ms vs 2-8 s (24 s worst, #131).
- **B scope (user decision 2026-11-17): only VN users go direct, decided by IP.** Page requests still pass CF → server reads `CF-IPCountry` (`server/utils/geo.js`) and tells the client its socket URL: VN → `direct.play3cr.win`, others → same-origin via CF (unchanged); fall back to CF if direct connect fails. Prod log geo lines: VN 955, JP 43, MY 17, AU 13 (connections, not users). Foreign users gain nothing (no Viettel leg; direct = VPS provider's intl transit, likely worse than CF backbone) — reasoning only, not measured (Globalping/RIPE Atlas would need user OK: exposes VPS IP).
- **B effect, page load (partial):** `?v=` assets are browser-cached `immutable` (first visit / post-deploy still via CF); HTML (`no-cache`) + REST (`/api/home`, `/api/profile/prefs`, forum/profile/club) stay on CF → can still stall 1-3 s. Room page gains most (state via socket), index medium, REST-heavy pages ~none.

## Don't
- Don't tune server/game code for this lag (origin is not the bottleneck); don't restart prod without warning (rooms lost).

## Risks of B (evaluated 2026-11-17; 🔴 must be solved in the design before enabling)
- 🔴 **CF header spoofing:** `utils/get-client-ip.js` trusts `CF-Connecting-IP` from loopback; Caddy also proxies via loopback → anyone can forge IP/country on `direct.` (bypass rate limits/bans, poison integrity data #353-#355). Caddy must strip client `CF-*` and set real IP; server must tell cloudflared vs Caddy apart. Tests pass while the hole stays.
- 🔴 **VPS IP exposed** (DNS-only A, kept in passive-DNS history): direct DDoS bypasses CF WAF/rate limit; small provider, likely no DDoS protection; VPS down = CF users down too (one origin). Mitigate only: Caddy serves `/socket.io` only, per-IP conn/rate limits, ufw 80/443. Volumetric attacks not preventable — user must accept.
- 🟠 **Cookie `Domain=play3cr.win`** also sends prod session cookies to `dev.play3cr.win` (PC app) and any future subdomain. Safer: keep host-only cookie, socket auth via short-lived ticket fetched over REST/CF into socket.io `auth` (+1 lossy request per connect), or move dev to another domain.
- 🟠 **Route choice / fallback vs reconnect:** reconnect is fragile (#131 #367 #391); direct→CF fallback risks flip-flop, duplicate sockets, double seats, clock drift. Route must be known before `socket-early.js` runs while HTML is static → middleware sets e.g. `route=direct` cookie from `CF-IPCountry` on the HTML response.
- 🟠 **Other ISPs unmeasured** (VNPT/FPT/4G → AS135918): a bad peering would make those users worse than now.
- 🟡 Partial fix only (HTML/REST/first asset load stay on CF → "lag" reports may continue; set expectations). No `CF-IPCountry` on direct sockets (carry via cookie or local GeoIP); CF Analytics loses socket traffic. Two paths → log `route=direct|cf`.
- 🟢 Caddy TLS needs port 80 or DNS-01 token; VPS IPv4 only; VPN users just stay on CF; one restart (rooms lost); Caddy RAM negligible, removes tunnel ceiling (~700 rooms). Rollback easy: server flag off or delete DNS record → all on CF, no client change.
- Verdict: worth doing if 🔴 spoofing + 🟠 cookie solved in design, other ISPs measured first, rollout behind a server-side flag with `route` logged to compare real latency.

## Why this way
VPS is in VN; domestic path avoids the lossy Viettel → CF international hop. Rejected: CF IP selection (free plan can't; partial CNAME needs Business, "optimized IP" tricks are fragile/ToS-grey); Argo / Tiered Cache / Load Balancing (only CF → origin, already 30 ms); new domain on CF Free (same IP ranges); waiting on Viettel. Paid option left open: Pro (~$25, 1-month trial: check whether `dig` IPs change + re-measure loss), Business (~$200/mo, "network prioritization" unconfirmed), Enterprise static IP/BYOIP (too costly). Knowledge: `docs/knowledge/vps-production-topology.md`.

## Done when
- Re-measured off-peak + one non-Viettel ISP; user picks an option. If applied: Viettel client connect p90 < 100 ms, no multi-second stalls; websocket game + Google login work on the new path; `npm test` green for the header change.
