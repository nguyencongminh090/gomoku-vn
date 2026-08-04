# Phần A #6. Quyết định kiến trúc khi cần scale quá 1 tiến trình

**Nguồn:** stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)


#### 6. Quyết định kiến trúc khi cần scale quá 1 tiến trình

- Toàn bộ state sống trong RAM của đúng 1 tiến trình: `RoomManager.rooms` (Map),
  và trong `server/socket/state.js` là `sessions`/`timerMap`/`disconnectTimers`/
  `readyTimers`. Không có clustering, không có worker_threads, không có adapter.
- Muốn chạy nhiều instance (hoặc `cluster`) thì **bắt buộc** kèm: sticky session
  ở tầng proxy + `@socket.io/redis-adapter` (hoặc tương đương) + đưa state phòng
  ra ngoài RAM tiến trình. Đây là quyết định hạ tầng + phụ thuộc mới, không phải
  sửa trong repo.
- **Đo được (2026-08-02): CPU chỉ ~12% của MỘT core ở 2000 người chơi đồng thời**,
  RSS ~200MB. Tức là **chưa** chạm trần 1 core — đừng làm việc này vì lý do hiệu
  năng ở thời điểm hiện tại. Chỉ làm khi có nhu cầu HA/không được downtime, hoặc
  khi đo lại thật sự thấy 1 core bão hoà.
- Ràng buộc kèm theo nếu làm: mất tiến trình = mất toàn bộ ván đang chơi (không
  có persistence cho state phòng), nên đây cũng là câu hỏi "chấp nhận mất ván khi
  restart hay không", không chỉ là câu hỏi throughput.
