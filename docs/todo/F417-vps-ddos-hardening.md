# F417 — VPS DDoS hardening (runbook, SSH limit, sysctl, loopback bind)
**Status:** ✅ DONE 2026-11-18 — deployed 3eaaa2f1; `ss` shows 127.0.0.1:3000, ws-check OK, route=direct reconnect seen
**Area:** VPS ufw + sysctl, `server/config.js`, `server/index.js`, `docs/knowledge/vps-ddos-self-defense.md`
**From:** user, 2026-11-18 ("could website be DDOS?" → research → "làm ngay 1 3 4 5")   **Depends:** —

## Problem
Host-level gaps: SSH open to all with no rate limit, tcp_max_syn_backlog 128, Node :3000 on all
interfaces (only ufw in front), no attack runbook.
## Scope
1. Runbook in the knowledge note. 3. `ufw limit OpenSSH`. 4. sysctl drop-in `60-gomoku-ddos-417.conf`.
5. `LISTEN_HOST` env (default all interfaces) → VPS `.env` 127.0.0.1.
## Don't
- Per-IP socket cap, Cloudflare rules, provider ticket (items 2, 6 of the note — not asked).
- Put VPS IP / distribution IDs in the repo.
## Traps
- cloudflared ingress is `http://localhost:3000`; localhost → 127.0.0.1 works (verified with curl on a 127.0.0.1-only server).
- ufw limit: bursts of >6 ssh sessions/30 s from one IP get dropped.
## Done when
- Code deployed; on VPS `ss -ltn` shows `127.0.0.1:3000`; `ws-check.js` passes on play3cr.win.
