---
name: vps-ddos-self-defense
domain: gomoku-vn
tags: ddos,vps,firewall,ufw,nftables,sysctl,socket.io,cloudflare,cloudfront
apply_when: "Hardening the production VPS against DDoS/flooding, adding per-IP connection limits, or planning an incident response to an attack on play3cr.win."
sources: "2026-11-18 research session; nftables wiki Meters; Cloudflare learning-path prevent-ddos-attacks; socket.io performance-tuning; fraggod 2025 nftables low-effort DDoS; oneuptime/openSUSE sysctl guides (values illustrative)"
last_reviewed: 2026-11-18
confidence: medium
---
# DDoS self-defense on the VPS (what a host can and cannot do)

## Core facts
- **A host cannot stop a volumetric flood.** Once the uplink is full, ufw/nftables drop packets that already
  cost bandwidth. Only upstream filtering helps: Cloudflare/CloudFront edge, or the VPS provider's anti-DDoS
  (vpssieutoc.vn offering **unknown** — ask support: filter capacity Gbps, null-route policy on attack).
- Host rules stop **low-effort** attacks: SYN floods, one-IP connection floods, SSH brute force, slow clients.
- **Per-IP rules on :443 are useless here**: every packet on 443 comes from a CloudFront IP, and tunnel
  traffic is loopback. Per-*client* limits must live where the real IP is known: CloudFront WAF
  (`CloudFront-Viewer-Address`), Cloudflare rules (`CF-Connecting-IP`), or Node (`getClientIp()`, see
  [proxy-client-ip-rate-limit](proxy-client-ip-rate-limit.md)).
- The origin IP is the asset. Known leak: DNS-only A `o-…play3cr.win` (needed as CloudFront origin). Other
  leak paths to check: IPv6 AAAA, old DNS history, outbound mail from the VPS, server sending requests to
  attacker-controlled URLs (avatar fetch, webhooks).

## Layers, cheapest first
| # | Layer | Action | Stops |
|---|---|---|---|
| 1 | Runbook | Cloudflare "Under Attack" mode; delete `direct` CNAME (all traffic back via CF); provider ticket | L7 floods via CF; direct-path abuse |
| 2 | Cloudflare (free) | 1 rate-limit rule on `/api/*`; Bot Fight Mode; cache rule for public GETs | bot L7, expensive uncached endpoints |
| 3 | CloudFront WAF | already 300 req/5 min/IP on direct | per-IP floods on socket path |
| 4 | ufw | `ufw limit 22/tcp` (6 new/30 s/IP) or SSH only from home IP; keep 443 = CloudFront list only | SSH brute force, scanning |
| 5 | sysctl | `tcp_syncookies=1`, `tcp_max_syn_backlog` 4096, `somaxconn` ≥ `LISTEN_BACKLOG`, `tcp_synack_retries=2` | SYN floods |
| 6 | Bind | Node listens on 127.0.0.1 only (now all interfaces, protected only by ufw) | firewall mistake exposing :3000/:3001 |
| 7 | Node / socket.io | per-IP **concurrent** socket cap; `maxHttpBufferSize` well below 1 MB default; `server.headersTimeout`/`requestTimeout` | connection hoarding, big payloads, slowloris |
| 8 | Ops | alert on CPU/socket count; `pm2` auto-restart already | detect + recover |

## Runbook: site under attack (#417)
Hosts, IPs, distribution IDs: agent memory / `vps-deploy` skill — never in this public repo.
1. **Confirm.** `ssh deploy@VPS 'uptime; ss -s; pm2 logs gomoku --lines 50 --nostream'`; Cloudflare
   dashboard → Analytics → Traffic/Security (spike? which path/country?). SSH slow + CF 52x = origin link
   flooded (go to 4); CPU 100 % with SSH fine = L7 (go to 2–3).
2. **Cloudflare "Under Attack".** Dashboard → zone `play3cr.win` (and `play3cr.dpdns.org`) → Security →
   Settings → Security level "I'm Under Attack". Browsers pass a JS challenge; already-open sockets keep
   working. Turn it back off after the attack (it delays first page load ~5 s).
3. **Close the direct path.** Delete the DNS-only `direct` CNAME → every socket falls back to Cloudflare (no
   restart, see `features/415-socket-direct/planning.md`). Recreate it afterwards (target in agent memory).
   For an L7 flood on `/api`: Security → WAF → Rate limiting rule (free plan: 1 rule), e.g. `/api/` 100 req/10 s/IP → block 10 s.
4. **Origin IP flooded.** Nothing on the host helps. Open a ticket with the VPS provider (anti-DDoS /
   null-route); if the IP is burned, ask for a new IP, update the DNS-only origin A record + ufw, keep `direct` off until done.
5. **After.** Undo 2–3, write a fix-log entry (what, when, which step worked), adjust this runbook.

## Applied on the VPS (#417, 2026-11-18)
- `ufw limit OpenSSH` (v4+v6, comment `ssh-ratelimit-417`): >6 new SSH conns/30 s/IP are dropped — scripts
  that open many ssh sessions in a burst must reuse one (ControlMaster) or pause.
- `/etc/sysctl.d/60-gomoku-ddos-417.conf`: syncookies 1, tcp_max_syn_backlog 128→4096, tcp_synack_retries
  5→2, somaxconn 4096, netdev_max_backlog 1000→4096.
- `LISTEN_HOST=127.0.0.1` in VPS `.env` (code: `server/config.js`) — active after the next `pm2 restart --update-env`.
- sshd already key-only (`sshd -T`: passwordauthentication no, permitrootlogin without-password).

## Deferred (not TODO items — user opens one when needed, 2026-11-18)
**Layer 2 — Cloudflare free features**
- Rate-limit rule `/api/*`: start in *Log* action, read a week of hits, then pick a threshold that never
  touches lobby load / polling; then switch to *Block*. 1 rule on the free plan.
- Bot Fight Mode: free plan cannot skip it per path → risk of challenging `/socket.io` long-polling and the
  Google OAuth callback. Try on `dev.play3cr.win` first.
- Cache rule for public GETs: audit each endpoint for per-user output first (session cookie, `req.user`);
  a wrong cache rule leaks one user's data to others.

**Layer 7 — per-IP concurrent socket cap (Node)**
- Key on `getClientIp()` (real client IP behind tunnel/CloudFront), count on connect, decrement on disconnect.
- Ship log-only first (max sockets per IP per day), then enforce at a generous cap (≈20–30) because VN mobile
  carriers share IPs (CGNAT). Reject with a clear error, never crash.
- Also consider `maxHttpBufferSize` below the 1 MB default and `server.headersTimeout`/`requestTimeout`.
- Size M: backend tests + browser pass + deploy (restart drops rooms).

## Traps
- ufw on Ubuntu is iptables-nft; mixing hand-written `nft` tables with ufw makes rule order hard to reason
  about. Prefer ufw (`/etc/ufw/before.rules` for raw rate limits) unless replacing ufw entirely.
- `connlimit`/per-IP caps punish NAT: VN mobile carriers put many players behind one IP (same reason
  `MAX_ROOMS_PER_IP` ≠ 1). Set socket caps generous (e.g. 20–30/IP) and log before enforcing.
- A Node restart drops all rooms → an attack that crashes Node costs more than one that slows it. Prefer
  shedding (reject new connections) over crashing.
- Sysctl values in blogs are examples; check current values first (`sysctl net.ipv4.tcp_syncookies`, `ss -s`).
- Never test DDoS defenses against production; use `dev.play3cr.win` or a local server.
