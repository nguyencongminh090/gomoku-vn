---
name: vps-production-topology
description: How gomoku-vn runs in production (VPS + pm2 + Cloudflare Tunnel), how updates, backups and rollback work, and the traps hit during the 2026-11-17 cutover.
domain: gomoku-vn
tags: vps,pm2,cloudflare-tunnel,deploy,rollback,backup,cors,pwa
apply_when: "Deploying or restarting production, changing VPS .env, moving/adding a hostname, restoring a backup, or debugging 502 / 'bad origin' on a play3cr domain."
sources: "2026-11-17 VPS cutover session (memory reference-vps-ssh), docs/todo/F411-legacy-host-redirect.md, SKILLS_TREE web-development/webops-release-rollback, docs/knowledge/db-backup-restore-retention.md"
last_reviewed: 2026-11-17
confidence: medium
---
# Production topology (workflow → skill `vps-deploy`)

```
browser ─► Cloudflare edge ─► tunnel GomokuVPS ─► cloudflared (VPS) ─► node :3000 (pm2 `gomoku`) ─► SQLite (WAL)
dev.play3cr.win ─► tunnel GomokuApp ─► cloudflared (PC) ─► node :3000 on the PC   (test only, stale DB)
```
- One Node process (single-threaded game loop, rooms **in RAM**), 2 vCPU / 2 GB. No nginx/certbot; ufw allows only SSH. Client is served as-is (no Vite build).
- Hostnames: `play3cr.win`, `play3cr.dpdns.org` (HTML → 302 to apex), `www` (edge 301 → apex) all on the VPS tunnel. Host/IDs live in agent memory, not here (public repo).
- Real data exists only on the VPS. The PC copy is a snapshot; two writers = divergence (accounts, ratings, games).

## Update, backup, rollback
| Step | Mechanism | Note |
|---|---|---|
| update | `~/update-gomoku.sh [-y]` | backup → `git pull --ff-only` → `npm ci` if lockfile changed → `pm2 restart` → health check; stops and prints rollback on failure |
| restart cost | rooms/games lost, sockets dropped (clients reconnect, get ROOM_GONE) | ask before; no zero-downtime path on one process (webops-release-rollback: blue-green would need 2 instances + sticky rooms) |
| backup | cron 03:30 `sqlite3 .backup` + integrity_check + avatars tgz, keep 7; PC pulls daily via rsync | follows `db-backup-restore-retention`; **a restore was never rehearsed** |
| rollback | `git reset --hard <old>` + `npm ci` + restart | does not undo migrations → expand/contract (`data-schema-evolution`) |

## Traps (each hit once)
- **`CORS_ORIGIN` is read twice** (socket handshake `isAllowedOrigin`, `origin-guard`); a missing origin shows as "Socket handshake rejected: bad origin" while REST still works. Env is read at start → restart with `--update-env`.
- A polling `curl` to `/socket.io` returns 200 even with a bad origin; only a real websocket connect (with Origin + session cookie) proves it. Use `.claude/skills/vps-deploy/ws-check.js`.
- Moving a hostname between tunnels: the old tunnel's ingress still had it → part of requests hit the PC cloudflared with no app → ~25 % 502 until the stale ingress line was removed.
- Installed PWAs are bound to their origin; users of the old domain are moved by `server/middleware/legacy-host-redirect.js` (F411): 302 for document navigations only, never `/api`, `/socket.io`, `/oauth-complete.html`.
- Different `JWT_SECRET` on the VPS → everyone re-logs once after a move. Never copy secrets without the user doing/approving it.
- Backup script once looked for avatars in `$APP/data` instead of `$APP/server/data` — a backup that "succeeds" can still omit data; check contents when paths change.
- `pkill -f <pattern>` kills the shell whose command line contains the pattern.

## Not covered / unknown
Real ceiling beyond ~800 simulated players (the tunnel, not the server, failed in tests); game-end DB write load; reconnect storm; off-box copy other than the PC; restore rehearsal.
