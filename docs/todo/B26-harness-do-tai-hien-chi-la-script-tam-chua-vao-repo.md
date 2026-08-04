# Phần B #26. Harness đo tải hiện chỉ là script tạm, chưa vào repo

**Nguồn:** stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)


26. ~~**Harness đo tải hiện chỉ là script tạm, chưa vào repo**~~
    **✅ ĐÃ LÀM (2026-08-02)** — người dùng xác nhận muốn đo định kỳ nên đã viết
    thành harness thật, nằm ngoài `e2e/*.spec.ts` (phá hoại tài nguyên, không
    trộn vào suite chức năng): `scripts/capacity-test/{orchestrator.js,
    worker.js,README.md}`.
    - **Đa tiến trình thật**: `orchestrator.js` dùng `child_process.fork` chia
      số phòng cho N tiến trình OS riêng (`worker.js`), không phải 1 event
      loop giả lập nhiều kết nối — đúng hướng Phần A #7 nêu, dù không giải
      quyết được A7 (đa máy) mà chỉ đa tiến trình cùng máy.
    - **Nhịp người thật**: mỗi nước có độ trễ ngẫu nhiên có thể chỉnh
      (mặc định 1200-3500ms), không còn nén cố định 400ms.
    - **Ngưỡng pass/fail rõ ràng**: tỉ lệ tạo phòng thành công tối thiểu, p95
      độ trễ nước đi tối đa, 0 lỗi khi chơi — exit code 0/1, không chỉ in số.
    - `server/config.js`: `MAX_ROOMS`/`MAX_ROOMS_PER_IP`/`MAX_USERS_PER_ROOM`
      giờ đọc được từ env (mặc định giữ nguyên giá trị production 10/3/20) để
      harness đổi tải mà không phải sửa file đã track mỗi lần — thay cho cách
      sửa tạm + `git checkout` trước đây ở mục 19-25.
    - **Phát hiện phụ khi chạy thử**: chạy nhiều tiến trình trên cùng 1 máy
      chia sẻ chung 1 IP nên bị `MAX_ROOMS_PER_IP` (không phải `MAX_ROOMS`)
      giới hạn trước — khớp đúng phát hiện đã xác nhận ở mục 25, không phải
      bug của harness; đã đổi mặc định `--rooms=3 --workers=3` cho đúng. Và:
      đóng socket thô (không phát `room:leave`) giữ phòng qua
      `DISCONNECT_GRACE_MS` (60s) trước khi nhả quota — đã sửa `worker.js`
      phát `room:leave` (đợi ack `room:left`) trước khi đóng để nhả ngay,
      chạy 2 lần liên tiếp không cần đợi xác nhận ổn.
    - Đã chạy thật để xác minh: ở cap production (`--rooms=3`) PASS 3 lần liên
      tiếp; ở cap nâng tạm (`MAX_ROOMS=20 MAX_ROOMS_PER_IP=20`, server phụ ở
      cổng 3099, đã tắt sau khi xong) `--rooms=20 --workers=5` PASS. `npm test`
      (284 test) vẫn xanh sau khi đổi `server/config.js`.
