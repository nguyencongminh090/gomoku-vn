# B467 — Verify: full 2-round team event e2e + server restart hydration
**Status:** ✅ VERIFIED 2026-11-25 — 2 rounds × 2 boards played, restart mid-round-2 hydrated correctly
**Area:** server team tournament flow, hydration on restart
**From:** club-platform handoff (memory), 2026-11-25   **Depends:** B460

## Scope
1. Disposable DB: 2-round team event, real games, server restart in the middle.
2. Check standings/pairings/state after restart match before.
3. Record result here. A real bug → own todo, not fixed in this session.

## Done when
- Result recorded with evidence; real DB md5 unchanged.

## Result (2026-11-25, dev fc980764, `verify.cjs e2e`, temp DB; real DB md5 8951e19c… unchanged)
- 4 users logged in through the real UI; 2 clubs; organizer creates team event (2 boards, 2 rounds)
  from the giải-đấu channel; both captains submit rosters; start.
- Each board: report time → confirm → both ready → auto-enter tournament-match → resign.
  R1: B1 Bảo Nam resigns, B2 Lan Anh resigns → 2:0; round 2 materialized with colours swapped.
- R2: B1 Trúc Mai resigns → 2:1. B2 time agreed (state Ready, "Đã thống nhất giờ"), then server
  SIGTERM + restart on the same DB. After reload: score 2:1, pairings panel text identical to before
  restart, round 2/2 "đang diễn ra". Ready + resign on B2 worked after restart → 3:1, status
  "Đã kết thúc", Kỳ Hội Mùa Thu "Vô địch (#1)" 3 W / 1 L, per-board rows consistent.
- Not covered: restart while a game is InProgress (only Ready/negotiating state hydrated).
- Shots: `features/club-platform/screenshots/verify/e2e-{r1-done,after-restart,final-standings}-{desktop,mobile}.png`.
- Side observation → #469 (black stone dot invisible on dark pairing cards).
