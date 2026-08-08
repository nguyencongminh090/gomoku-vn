# Tournament Match Series — Planning

Status: **decisions locked (2026-08-06)**. All open questions below have been answered by the user.
Next step is formalizing into `TODO.md`/`instruction.md` (code B50) per `CLAUDE.md`'s feature
workflow — see [Sequencing](#sequencing).

## Resolved decisions (2026-08-06)

1. **Race-to-margin: no safety cap.** Uncapped by design — the series keeps playing until the
   margin condition is met, however many games that takes (e.g. target 12/margin 2: 12.5-12 is not
   enough, continues; 14.5-12 clinches it). No tiebreak fallback needed since the mode is
   open-ended, not bounded.
2. **Scheduling/negotiation: once for the whole series.** The existing `Paired -> Negotiating ->
   Ready` flow (propose time, confirm, dispute, organizer-resolve) runs once per pairing, covering
   the whole series — not renegotiated before each game. `pairing.deadline`/`pairing.overdue` stay
   single fields, unchanged from the base feature.
3. **Mid-series no-show: walkover for the whole series.** A no-show at any point forfeits the
   entire remaining series for that pairing, not just the current game — consistent with the base
   feature's "Round loss only" punishment (decision 1 in `features/tournament/planning.md`).
4. **Color: alternates every game; Swap2 applies to every game.** Not just game 1 — each game in
   the series independently alternates color and (if the tournament's `RuleSet` has Swap2 enabled)
   runs its own Swap2 opening phase.
5. **Timer: fresh `TimerManager` per game.** Confirmed — no time carries over between games in the
   series, consistent with the base feature's decision 7.
6. **Data model:** `pairing.result` (single value today) becomes `pairing.games: [{index,
   winnerEntryId|draw, endedAt}]` + a derived `pairing.seriesScore: {entryId: score}`, per the
   sequence diagram
   ([diagram/uml_diagram/sequence-match-series-game-transition.md](diagram/uml_diagram/sequence-match-series-game-transition.md)).
7. **UI: reuse room.html's UI components, cosmetically only.** The tournament match page borrows
   room.html's existing spectator/chat tab chrome (room.html already has a "Khán giả" spectator tab
   that `tournament-match.html` currently lacks) so series matches get audience/spectator support
   without building new UI from scratch. This is **UI-component reuse only** — the backend session
   stays on `TournamentMatchHandler`, not routed through `RoomHandler`/`GameHandler`, preserving the
   base feature's architectural separation constraint
   ([features/tournament/user_story.md](../tournament/user_story.md#architectural-constraint)).
   Exact running-score placement (header vs. pairing card) and the next-game transition are
   implementation-level UI details, not blocking design decisions.

## Ghi chú thuật ngữ (2026-08-06)

- **"Sub-game"** = tên gọi của người dùng cho từng ván riêng lẻ bên trong chuỗi ván của một cặp đấu
  — tương ứng đúng với `pairing.games[]` ở quyết định 6 phía trên. Không phải khái niệm mới, chỉ là
  tên gọi thay thế cho "game trong series" đã dùng trong tài liệu này.
- **Kết quả cặp đấu → điểm cá nhân**: người dùng xác nhận kết quả tổng của cả chuỗi ván
  (`pairing.result`, tức bên nào thắng series) được dùng làm kết quả cá nhân để xếp cặp Swiss vòng
  sau / xác định người thắng-thua nhánh Double Elimination — **đây chính xác là cách
  `pairing.result` đã hoạt động trong code hiện tại** (`TournamentManager._computeSwissStandings`,
  `doubleElim.js`'s bracket resolution đều chỉ đọc `pairing.result.winnerEntryId`, không quan tâm
  pairing có 1 ván hay nhiều ván bên trong). Không cần thay đổi thiết kế gì thêm ở tầng
  Swiss/Double-Elim — series chỉ thay đổi *cách* `pairing.result` được tính ra (quyết định 1),
  không đổi *cách nó được dùng*.
- **Round Robin CÓ chia Round — đã xác nhận, khớp với code hiện tại (2026-08-06).** Người dùng ban
  đầu nghĩ Round Robin không cần "Round", nhưng sau khi trao đổi đã xác nhận ngược lại: "Round
  trong Round Robin là một lần gặp đối thủ mới" — vì thuật toán circle method xoay vòng tạo ra một
  bảng vuông (square) mà mỗi cột chính là một Round. Đây **chính xác là cách
  `roundRobinPairing.generateAllRounds()` đã hoạt động** (đã có từ B48, đã có test) — mỗi vòng lặp
  `r` trong hàm sinh ra đúng 1 Round trong đó mỗi người chơi gặp đúng 1 đối thủ mới, không lặp lại
  đối thủ cũ trong suốt giải. **Câu hỏi mở đã đóng — không cần sửa `roundRobin.js` hay
  `TournamentManager.startTournament`, code hiện tại đã đúng theo đúng ý người dùng.**

## Sequencing

1. ~~Resolve open questions above with the user.~~ ✅ Done 2026-08-06.
2. Formalize into `TODO.md`/`instruction.md` per `CLAUDE.md`'s "New requirements/tasks: stack,
   don't perform directly" convention — code **B50**.
3. Data model: extend `server/db/schema.sql` pairings storage + `PairingLifecycle.js`'s in-memory
   `pairing` shape per decision 6 above.
4. `TournamentManager`/`PairingLifecycle`: series-score evaluation (fixed-count vs. race-to-margin,
   uncapped) + the `Ready <-> InProgress` re-loop shown in
   [diagram/state-diagram-pairing-series.md](diagram/state-diagram-pairing-series.md).
5. `TournamentMatchHandler`: multi-game transition (fresh `GameEngine`/`TimerManager` per game,
   alternating color + per-game Swap2, `tmatch:started` re-emit) per
   [diagram/uml_diagram/sequence-match-series-game-transition.md](diagram/uml_diagram/sequence-match-series-game-transition.md).
6. `RuleSet` schema: add `seriesMode: 'single' | 'fixedCount' | 'raceToMargin'`, `seriesGameCount`,
   `seriesTargetScore`, `seriesMargin` (all organizer-input; no cap field needed per decision 1) —
   `'single'` preserves today's one-game-per-pairing behavior as the default so existing tournaments
   and tests are unaffected.
7. UI: port room.html's spectator/chat tab components into `tournament-match.html`, add running
   score display + next-game transition (decision 7), on a new `feature/tournament-match-series`
   branch off `dev`, per `CLAUDE.md`'s feature-branch workflow.

## Related files

- [user_story.md](user_story.md) — actors, stories, resolved decisions.
- [diagram/state-diagram-pairing-series.md](diagram/state-diagram-pairing-series.md)
- [diagram/uml_diagram/sequence-match-series-game-transition.md](diagram/uml_diagram/sequence-match-series-game-transition.md)
- [../tournament/planning.md](../tournament/planning.md) — base tournament feature (already
  implemented, B48) that this extends.
