# B193 — R1: Arena shell on lobby, history, tournament detail
**Status:** OPEN — merged to dev 2026-10-09; real-server pass done with B195 (sandbox :3100); awaiting user sign-off
**Area:** client (html/css/js) — no server
**From:** features/platform/planning.md § Release 2 (R1) + user report 2026-10-09 "tab index không đồng nhất UI"

## Problem
Lobby (`index.html`), `history.html`, `tournament.html` use the old `topnav`; rankings/profile/clubs use
`platform-shell.js` (#189). Two different headers across the site; lobby lacks mode toggle, user chip, tabbar.

## Scope
- `platform-shell.js` nav = mockup items that exist today: Chơi · Giải đấu (`/index.html#tournaments`) ·
  Xếp hạng · CLB · Học (`history.html`). "Phòng" waits for R2 (Chơi becomes a dashboard then).
  User chip shows best rating ("Gomoku 1612") from `/api/rankings/me`. Mobile tabbar: Chơi/Xếp hạng/Giải/CLB/Tôi.
- Lobby: shell replaces `topnav`; intro h1 + bar (tabs left, actions right) like mockup Rooms screen;
  drop the Lịch sử/Xếp hạng/CLB buttons (now in nav); `#tournaments` hash ↔ tab.
- History + tournament detail: shell replaces their topnav; content in Arena cards.
## Don't
- `room.html`, `tournament-match.html` (in-game; planning Q6). No server change. Bell = R4.
- Keep `#nav-user/#nav-badge` consumers null-safe rather than deleting their JS.
## Traps
- `.pl :where(button)` reset has class specificity → see B192. Vite: index imports must match modulepreload list.
