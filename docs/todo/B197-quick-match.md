# B197 — R3: quick match queue (Ghép trận nhanh)
**Status:** OPEN — implemented 2026-10-09 on `feature/197-quick-match` (uncommitted, stacked on fix/196); unit + jsdom + real-server pass (sandbox :3100) done; awaiting user review
**Area:** server (MatchQueue + socket handler) + client (home screen panel)
**From:** features/platform/planning.md § Release 2 (R3), decisions 2–3

## Decided
- Fischer clock = existing `blitz` mode (TimerManager adds the increment) — no new clock mode.
- Chips: rule Free-style/Standard/Caro VN × time 1+0 / 3+2 / 5+3 / 10+0 (blitz, m×60 s + inc). No Thư tín, no Renju.
- Rated = members only (guests: casual only). Board = default size; wall/portal/swap2 off.
## Approach
- `server/managers/MatchQueue.js` (pure, injectable clock): bucket `rule|time|rated`; one entry per user;
  rating window ±100, +50 every 5 s, unlimited after 30 s (casual: FIFO); oldest pairs first.
- `handlers/MatchHandler.js`: `match:join {rule,time,rated}` / `match:leave`; leave on disconnect; refuse when
  already in a room. One 1 s ticker, running only while the queue is non-empty. On a pair: createRoom(A) →
  joinRoom(B) → sit 1/2 → sockets join the room → emit `room:joined` (lobby already redirects) + `match:found`.
  Players then press Start (existing ready check) — clocks never run before both pages load.
- `match:status {waiting, since, inBucket}` to each waiting socket (~2 s).
- Client: home "Ghép trận nhanh" panel (mockup) — chips, "Tìm đối thủ xếp hạng" (members), "Chơi thường",
  searching state with elapsed time + Huỷ.
## Don't
- "Thách đấu bạn bè" (R4). No estimated-wait number (no data) — show waiting count instead.
## Traps
- A queued user who meanwhile joins a room must be dropped at pairing time (re-check getRoomByUser).
- Never pair a user with themself (two tabs). Room IP quota applies to player A.
