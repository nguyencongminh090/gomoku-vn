---
name: vps-deploy
description: "gomoku-vn production deploy/rollback on the VPS (play3cr.win): preflight, update-gomoku.sh, verify incl. websocket, rollback, .env changes, Cloudflare hostname changes, dev.play3cr.win test route. Load before pushing code to production, restarting the VPS app, editing the VPS .env, or touching tunnel/DNS for play3cr.win / dpdns / dev."
compatibility: claude-code-only
---

# Deploy to the VPS

Facts, topology and traps → `docs/knowledge/vps-production-topology.md` (read it once). The VPS address, tunnel IDs and
Cloudflare zone IDs are NOT in the repo (public): they are in agent memory `reference-vps-ssh`; if absent, ask the user.
Secrets (JWT, Google keys, tokens, passphrases): **the user enters them; never print or retype them.**

## Rules
- Prod is outward-facing: **get the user's explicit go before the restart.** Restart drops every in-memory room/game and
  disconnects live players. Say so in the ask. "-y" only after that go.
- VPS pulls from GitHub → code must be on `origin/dev` first. Never edit files on the VPS tree (the script refuses a dirty tree).
- PC and VPS must never both serve real users (two DBs). Only `dev.play3cr.win` points at the PC.
- Never `pkill -f` a pattern that appears in your own command.

## 1. Preflight (local)
1. `git status -sb` on `dev`, nothing the deploy depends on uncommitted; `npm test` green; `node scripts/cache-bust.js` prints OK if `client/` changed.
2. Pushed? `git push origin dev` (ask if not already authorised).
3. Schema change in the diff (`server/db/migrations/`)? Migrations run forward at startup and a code rollback does NOT undo them →
   the change must work with old and new code (note `data-schema-evolution`); a pre-deploy backup is taken by the script.
4. New/changed env var? Edit the VPS `.env` (step 4) **before** the restart so one restart applies both.
5. Optional dry run: `dev.play3cr.win` (§6).

## 2. Deploy
`ssh deploy@$VPS '~/update-gomoku.sh'` (prompts) or `… -y` after the user's go. It: lock → refuse dirty tree → `~/backup-gomoku.sh`
→ `git pull --ff-only` → `npm ci --omit=dev` only if package*.json changed → `pm2 restart gomoku --update-env` → GET `/` = 200 (retries) + log tail.
No new commits = exits after the backup with no restart. On any failure it stops and prints the rollback command.

## 3. Verify (prod, public URL — not just localhost)
- `curl -s -o /dev/null -w '%{http_code}' https://play3cr.win/` = 200; `POST /api/auth/guest` = 200.
- Websocket, the thing curl cannot see: `node .claude/skills/vps-deploy/ws-check.js https://play3cr.win https://play3cr.win` → `SOCKET CONNECTED`;
  with `https://evil.example` it must fail `AUTH_ORIGIN`. (A plain polling curl is NOT proof: the origin check runs on connect.)
- `pm2 logs gomoku --err --lines 20 --nostream`: no new "bad origin"/crash lines for our own origins.
- Redirect check if touched: `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -H 'Sec-Fetch-Dest: document' https://play3cr.dpdns.org/` → 302 to play3cr.win.
- Say what was NOT verified (real-browser game, Google login, installed PWA) instead of "all good".

## 4. `.env` on the VPS
Back up first (`cp -p .env .env.bak-<why>`), edit only the needed lines, keep chmod 600, then `pm2 restart gomoku --update-env`
(env is read at start only). Every origin that serves the app must be in `CORS_ORIGIN` (comma list: socket auth + origin-guard read it).
Secrets: have the user run the one-liner (`grep … | ssh … 'cat >> .env'`) or paste themselves; confirm with `grep -c`, never `cat`.

## 5. Rollback
Code: the failed script printed it: `cd ~/gomoku-vn && git reset --hard <OLD> && npm ci --omit=dev && pm2 restart gomoku`; re-verify (§3).
DB only if a migration/data change broke it: `pm2 stop gomoku`, restore the newest good `~/backups/gomoku-*.db.gz`
(`gunzip -c … > server/db/gomoku.db`, remove `-wal`/`-shm`), `integrity_check`, start. Restoring loses everything written since that backup — ask first.
Domain move rollback = flip the CNAME back to the previous tunnel target (§7).

## 6. Test before deploy: dev.play3cr.win → PC
Run the app on the PC with `CORS_ORIGIN=https://dev.play3cr.win npm run dev` (or add it to the PC `.env`), then `ws-check.js https://dev.play3cr.win https://dev.play3cr.win`.
PC DB is a stale snapshot: tests there never touch real users. Google login there needs its callback URI added in Google Console.

## 7. Cloudflare hostname changes (mcp cloudflare-api)
Order: add hostname to the target tunnel's ingress (before the 404 catch-all) → change/create the proxied CNAME to
`<tunnel-id>.cfargotunnel.com` → **also remove the hostname from the old tunnel's ingress** (a stale route gave ~25 % 502s) →
add the origin to `CORS_ORIGIN` + restart if it serves the app → 20× curl loop shows no 502. Edge redirect rules (e.g. www → apex) sit in front; leave them unless asked.

## Don't
- Don't deploy with a dirty VPS tree, unpushed code, or without the user's go for the restart.
- Don't delete the old DB/backup copies, or run a full-DB restore, unasked.
- Don't print or copy secrets; don't `cat` the VPS `.env`.
