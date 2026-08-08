# Phần B #62. Check-in "Sẵn sàng" giữa các ván trong series nên ở lại `tournament-match.html`, không bắt quay lại trang giải đấu

**Nguồn:** yêu cầu người dùng, 2026-08-08 — nhận xét về luồng series (nhiều ván trong 1 pairing, B50).

62. **Sau khi 1 ván trong series kết thúc, người chơi bị đẩy ra khỏi màn hình trận đấu để check-in
    "Sẵn sàng" (Ready) ván kế tiếp — nên giữ họ ở lại trong trận đấu thay vì bắt quay về trang giải
    đấu.**
    - **Hiện trạng (đã xác nhận qua code, 2026-08-08):** `PairingLifecycle.startNextGame()`
      (`server/managers/tournament/PairingLifecycle.js:314-322`) đưa `pairing.state` từ `InProgress`
      về `Ready` và xoá sạch `pairing.readyPlayers` sau mỗi ván. Việc check-in lại
      (`TournamentManager.markPairingReady()`,
      `server/managers/tournament/TournamentManager.js:488-513`) hiện chỉ được kích hoạt từ luồng UI ở
      trang **chi tiết giải đấu** (`tournament-detail.js`/`tournament.html`), không có ở trang
      **trận đấu** (`tournament-match.js`/`tournament-match.html`). Trang trận đấu đã có sẵn overlay
      chuyển ván (`showSeriesTransition`/`hideSeriesTransition`,
      `client/js/tournament-match.js:625-652`) hiển thị kết quả ván vừa xong + tỉ số series, nhưng
      overlay này thuần thông báo — không có nút "Sẵn sàng" để check-in ngay tại đó, nên người chơi
      vẫn phải tự điều hướng ra khỏi trang trận đấu.
    - **Đề xuất của người dùng:** tái sử dụng Start Modal hiện có của Room (đã redesign ở B36) làm cơ
      chế check-in "Sẵn sàng" cho ván kế tiếp trong series, hiển thị ngay trong `tournament-match.html`
      — người chơi không cần rời màn hình trận đấu / quay lại trang giải đấu để bấm Sẵn sàng.
    - **Đánh giá hiệu quả/an toàn (sơ bộ, chưa vào `instruction.md` execution guidance đầy đủ):** hiệu
      quả cao về UX — đây là điểm ngắt mạch trải nghiệm rõ trong luồng series, cùng nhóm vấn đề với
      B52/B55 (feature completion checklist "kiểm tra cả 2 lớp + luồng người dùng thật" trong
      CLAUDE.md). An toàn: không đổi state machine phía server (`Ready`→`InProgress` vẫn giữ nguyên
      qua `markPairingReady`), chỉ đổi **nơi** UI check-in được trigger — rủi ro thấp nếu giữ đúng event
      `pairing:ready` (hoặc tên tương đương) hiện có, không tạo luồng check-in song song mới.
    - **Trạng thái:** chưa làm — mới ghi nhận yêu cầu, cần thảo luận thêm chi tiết kỹ thuật (modal chỉ
      tái dùng UI/CSS của Start Modal, hay cả áp dụng cho cả 2 người chơi cùng lúc trong 1 trang) trước
      khi triển khai. Xem `docs/instruction/B62-*.md` cho hướng tiếp cận kỹ thuật đề xuất.
