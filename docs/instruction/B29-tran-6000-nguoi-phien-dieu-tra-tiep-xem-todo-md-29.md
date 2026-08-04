# B29. (trần >6000 người, phiên điều tra tiếp — xem TODO.md #29)

### B29 (trần >6000 người, phiên điều tra tiếp — xem TODO.md #29)

Bài học phương pháp cho lần đo tiếp theo nếu mục này còn mở:

- **`ps`'s `%CPU` là trung bình trượt, không phải tức thời** — lần đo gốc lấy
  mẫu 1 lần/giây bằng `ps` và kết luận CPU chỉ ~26%, "không phải nghẽn". Lần
  đo lại dùng `/proc/PID/stat` (utime+stime) lấy delta thật giữa 2 mốc, 5
  mẫu/giây, và thấy CPU thật vọt tới 100-190% đúng trong khung burst — `ps`
  đã che mất đỉnh ngắn. **Nếu cần kết luận "CPU có phải nghẽn không" cho một
  burst ngắn, đừng dùng `ps` lấy mẫu thưa — dùng delta `/proc/PID/stat` (hoặc
  `pidstat` với interval nhỏ) trong đúng khung burst.**
- **Cách loại trừ nghi phạm bằng thực nghiệm, không chỉ profiling:** để
  loại `jwt.verify`, không chỉ nhìn profile mà còn chạy lại đúng kịch bản với
  `jwt.verify` bị monkey-patch thành no-op (`node --require <preload>`, không
  đụng file gốc — preload thay `jwt.verify` trên module cache dùng chung,
  không cần sửa `server/middleware/auth.js`). Nếu số liệu không đổi → loại
  trừ được thật, không phải suy đoán từ "hàm này có vẻ nhẹ".
- **`--cpu-prof` là cách rẻ nhất để tìm hot path thật** — `node --cpu-prof
  --cpu-prof-dir=<dir> server/index.js`, chạy burst, gửi `SIGINT` để flush
  file `.cpuprofile`, rồi cộng dồn `timeDeltas` theo `samples`/`nodes` (script
  Node ngắn, xem cách làm trong `docs/fix-log.md` mục 2026-08-02 22:41) để ra
  bảng self-time theo hàm — không cần công cụ ngoài (clinic.js, --prof + tick
  processor) cho một lần khoanh vùng nhanh.
- **Xác nhận nhân-quả trước khi tin một dòng trong profile là nguyên nhân**:
  self-time cao trong profile chỉ là tương quan. Tắt tạm đoạn code nghi ngờ
  (bản nháp, không commit — đúng rule chung #0 "copy sang thư mục tạm"), chạy
  lại đúng kịch bản, so tỉ lệ thành công trước/sau. Chỉ khi số cải thiện thật
  mới coi là xác nhận, mới đi sửa thật.
- **Tìm được, đã sửa:** `lobby:online_users` broadcast (`SocketHandler.js`)
  chạy O(n) mỗi lần *một* connect/disconnect, n lần trong 1 burst n người =
  O(n²) — sửa bằng debounce cùng pattern `broadcastLobbyUpdate()` đã có.
- **Chưa isolate xong, đừng giả định đã đóng:** `saveGame()`'s SQLite
  transaction đồng bộ (~10% self-time trong profile) — nhưng đây là hệ quả
  hình dạng workload của chính harness (mọi phòng test kết thúc bằng
  `room:leave` giữa ván, bị coi là đầu hàng), **chưa** có bằng chứng đây là
  chi phí xảy ra ở traffic thật (nơi phần lớn ván kết thúc rải rác theo thời
  gian, không dồn cục trong 1 burst). Nếu đo tiếp: cần một kịch bản có nhiều
  ván **kết thúc tự nhiên** (hết nước/thắng thật) dồn trong 1 khung giờ ngắn,
  không phải suy diễn từ hành vi `room:leave` giữa ván của harness.
