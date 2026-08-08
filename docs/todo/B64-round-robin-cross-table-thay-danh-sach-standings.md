# Phần B #64. Round Robin: thay bảng Standings dạng danh sách bằng Cross Table (bảng chéo) hiện tỉ số thật từng cặp đấu

**Nguồn:** tiếp tục từ #63 (2026-08-08) — sau khi #63 xác nhận cơ chế xếp hạng hiện tại (1 điểm/pairing
+ Buchholz/SB) đúng chuẩn Swiss/FIDE và bị đóng không sửa, người dùng đề xuất một hướng khác, **hẹp và
đúng chuẩn thật hơn**: không đổi cách tính rank, chỉ đổi **cách hiển thị Standings riêng cho Round
Robin**.

## Quan hệ với #63

- **Không mâu thuẫn với #63** — #63 kết luận Buchholz/SB (tie-break) và match points (1 điểm/pairing,
  xếp hạng chính) đúng chuẩn Swiss/FIDE cho **Swiss**, vẫn giữ nguyên hoàn toàn.
- Mục này chỉ nói về **Round Robin**, và chỉ đổi **hiển thị**, không đổi cách tính điểm/rank nội bộ.
  Tra cứu thêm (2026-08-08) xác nhận Round Robin (league-style) thật ra dùng bộ tie-break khác Swiss:
  match points → head-to-head → điểm/hiệu số thật → tổng điểm ghi được — **không dùng Buchholz/SB**
  (vì mọi người đều gặp đủ mọi đối thủ, nên "sức mạnh đối thủ" không phân biệt được ai với ai).
  ([printyourbrackets.com — Tiebreaker Rules for Round Robin](https://www.printyourbrackets.com/tiebreaker-in-round-robin-tournaments.html),
  [pickleball518.com — round-robin tiebreak FAQ](https://www.pickleball518.com/how-do-you-break-a-tie-in-a-round-robin-pickleball-tournament/))
  → Buchholz/SB hiện đang áp cho cả Round Robin lẫn Swiss (`standings.js` dùng chung 1 hàm cho mọi
  format không phải double_elim) là hơi lệch chuẩn, nhưng người dùng chọn **không sửa phần tie-break
  này** — chỉ đổi hiển thị sang Cross Table, xem "Ranh giới" bên dưới.

## Thiết kế đã chốt với người dùng (2026-08-08)

64. **Round Robin: thay hẳn bảng Standings dạng liệt kê hiện tại bằng Cross Table.**
    - Lưới N×N, hàng và cột là tên người chơi trong giải.
    - Mỗi ô giao giữa 2 người hiện **tỉ số thật của pairing đó** — ví dụ ô [A,B] = "4–2" nếu A thắng B
      4-2 (series nhiều ván), "0.5–0.5" nếu hoà, để trống/gạch ngang nếu 2 người chưa đấu (hoặc pairing
      chưa hoàn thành).
    - Dữ liệu nguồn: `pairing.seriesScore` (đã có sẵn, tính bởi `series.js#computeSeriesScore`, cập
      nhật mỗi lần `recordPairingResult` chạy) — không cần thêm state mới, chỉ cần đọc đúng field này
      theo từng pairing và render thành lưới thay vì danh sách.
    - Chỉ áp dụng cho **Round Robin** — Swiss giữ nguyên bảng Standings dạng danh sách + Buchholz/SB
      như hiện tại (khác hệ thi đấu → khác cách hiển thị, đúng như người dùng phát biểu: "với một hệ
      thi đấu khác nhau sẽ có một display khác nhau"). Double Elimination không đổi (vẫn không có
      Standings, chỉ có bracket).
    - **Không đổi cách tính rank/tie-break nội bộ** — `standings.js#computeStandings/computeTiebreaks/
      rankStandings` giữ nguyên logic hiện tại (dùng nội bộ nếu cần, ví dụ để xác định thứ hạng cuối
      `finalRank` khi tournament hoàn thành) — chỉ đổi phần RENDER ở `renderStandings()`
      (`tournament-detail.js`) cho format `round_robin`.

## Phạm vi kỹ thuật dự kiến

- `client/js/tournament-detail.js#renderStandings()` (dòng 645-684) — hiện có nhánh riêng cho
  `double_elim` (chỉ hiện thông báo, không có bảng). Cần thêm nhánh riêng cho `round_robin`: build
  lưới N×N từ `tournament.entries` (hàng/cột) + `pairingsById` (tra theo cặp `player1EntryId`/
  `player2EntryId` để lấy `seriesScore`, hoặc `result.winnerEntryId`/`reason:'bye'` cho pairing không
  có 2 người). Swiss vẫn dùng `computeStandings()` hiện tại (danh sách + Buchholz/SB).
- Cần map nhanh `(entryIdA, entryIdB) -> pairing` — hiện `pairingsById` chỉ index theo `pairingId`,
  cần duyệt qua để build map phụ (hoặc build 1 lần khi render).
- CSS mới cho layout lưới (`tournament.css`) — bảng N×N có thể rộng hơn nhiều màn hình khi N lớn, cần
  `overflow-x: auto` hoặc tương tự để không vỡ layout mobile (đối chiếu "Feature completion checklist"
  trong CLAUDE.md — verify cả responsive, không chỉ desktop).
- i18n: thêm khoá mới cho tiêu đề Cross Table (namespace `tdetail.*` hiện có).
- Không cần đổi gì phía `server/` — dữ liệu (`seriesScore`) đã serialize sẵn qua pairing, chỉ cần xác
  nhận `TournamentManager.serializePairing()` có expose `seriesScore` ra client hay chưa (nếu chưa,
  đây là phần server duy nhất cần đụng — thêm field vào serialize, không đổi logic tính).

## Đánh giá hiệu quả/an toàn (sơ bộ)

- Hiệu quả cao — đúng nhu cầu thật của người dùng (xem chi tiết từng cặp đấu trực quan hơn dạng danh
  sách tổng), đúng chuẩn hiển thị round-robin thật (cross table là dạng hiển thị kinh điển của round-
  robin trong cờ vua/esports).
- An toàn cao — thuần thay đổi hiển thị (client-side render), không đổi state machine, không đổi logic
  xếp hạng/tie-break/pairing nội bộ. Rủi ro chính chỉ là UI responsive với N lớn (xem phần CSS ở trên).

## Trạng thái

Chưa làm — mới ghi nhận theo thiết kế đã chốt với người dùng qua trao đổi 2026-08-08. Xem
`docs/instruction/B64-*.md` cho hướng triển khai chi tiết hơn.
