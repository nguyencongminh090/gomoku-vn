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

## Follow-up 2026-11-25 (`verify.cjs e2e2`, run 3×, temp DB; real DB md5 unchanged)
- Real moves via board clicks: R1 B1 black makes five in a row (17×17 freestyle) → "You won!", history
  winner BLACK reason win; R1 B2 4 moves, draw offer → accept → "The game is a draw" → 1.5:0.5.
- Restart **while InProgress** (R2 B1, 3 moves): server side correct — pairing hydrates to Ready, same
  pairingId, both players must check in again, replay starts on an empty board, the aborted game is
  not recorded (history has 4 games). Final 2.5:1.5, Champion Kỳ Hội Mùa Thu.
- Client side bug → #472: the match page keeps showing the aborted game as live (3 moves, clock
  ticking, board clickable, no banner) 12 s after the restart.
- Found on the way → #470: desktop tournament-match board renders 150 px at 1365×900.
- Shots (local, gitignored): `features/club-platform/screenshots/verify/e2e2-{five-win,r1-done,match-after-restart,after-midgame-restart,final-*}*.png`.
