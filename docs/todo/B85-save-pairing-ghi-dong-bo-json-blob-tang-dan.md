# Phần B #85. `savePairing()` ghi SQLite đồng bộ mỗi lần pairing đổi trạng thái, blob `games`/`moves` được stringify lại toàn bộ mỗi lần — cần ĐO trước khi sửa

**Trạng thái:** ✅ Đã đóng, không sửa (2026-08-09) — đã đo, không phải bottleneck. Xem "Kết quả đo"
ở cuối file.

**Nguồn:** báo cáo người dùng — "moving in tournament (navigate, comein/out...) sometimes slow" (2026-08-09), điều tra qua [docs/tournament-navigation-latency-report.md](../tournament-navigation-latency-report.md) mục 3.5.

## Vấn đề đã xác nhận (đọc code qua CodeGraph, không suy đoán)

`savePairing()` (`server/db/database.js:605-636`) chạy mỗi lần trạng thái
pairing đổi (report time, confirm, ready, mỗi nước đi lưu vào `moves`, ván
kết thúc...) — dùng `db.prepare(...).run(...)` **đồng bộ** (better-sqlite3),
trong đó `games`/`moves` được `JSON.stringify` lại **toàn bộ mảng** mỗi lần
gọi (không phải append phần mới). Càng về cuối trận, mảng càng dài, thời gian
stringify + ghi WAL càng tăng dần theo trận, và vì better-sqlite3 đồng bộ,
việc ghi này **chặn event loop** của toàn server trong lúc thực thi — ảnh
hưởng luôn tới các socket khác đang thao tác navigate/join cùng thời điểm.

## Việc cần làm

Xem hướng dẫn chi tiết: [docs/instruction/B85-save-pairing-ghi-dong-bo-json-blob-tang-dan.md](../instruction/B85-save-pairing-ghi-dong-bo-json-blob-tang-dan.md).

**Lưu ý quan trọng:** đây là mục có độ tin cậy thấp nhất trong 5 phát hiện —
chưa có số đo thực tế (kích thước blob trung bình, tần suất ghi, thời gian
chặn event loop thực đo). Theo đúng nguyên tắc "Root-cause diagnosis" của
repo, **không sửa code trước khi đo** — xem chi tiết cách đo trong file
instruction.

## Kết quả đo (2026-08-09)

Benchmark độc lập (không đụng `server/db/gomoku.db` thật — db tạm trên cùng ổ đĩa ext4 để I/O
thực tế, tự dọn sau khi chạy), tái tạo đúng câu lệnh `INSERT ... ON CONFLICT` của `savePairing()`
với dữ liệu thực tế:

- Shape thật của `pairing.moves`: `{x, y, color, timestamp}` (`GameEngine.js:191-195`), không phải
  giả định ban đầu.
- Board tối đa: 20×20 = 400 nước đi/ván (`config.js:75-76`, `VALID_BOARD_SIZES`), không phải 225
  (15×15) như suy đoán ban đầu trong file này.
- Series tối đa: `fixedCount` cho phép tới 99 ván/pairing (`TournamentManager.js:1364`), viễn cảnh
  thực tế thường chỉ vài ván.

**Kết quả:**
- Trong 1 ván, `moves` tăng dần tới 400 nước (worst-case): `stringify + write` tăng tuyến tính
  nhưng vẫn **dưới 0.1-0.3ms** ở hầu hết các mốc đo (25 → 400 nước) — xa dưới ngưỡng 5ms coi là
  "đáng lo" trong hướng dẫn gốc.
- Qua cả series 99 ván (mỗi ván 400 nước, `games` blob tăng lên ~7.6KB): `stringify + write` ổn
  định quanh **0.1-0.14ms**.
- **Phát hiện phụ, KHÔNG liên quan tới kích thước blob:** một lần ghi/loop bị chặn ~138ms
  (tái lập nhất quán qua 3 lần chạy độc lập), xảy ra đúng lúc tổng dữ liệu ghi tích lũy chạm
  ngưỡng auto-checkpoint mặc định của SQLite WAL (~4MB / 1000 trang) — đây là hành vi
  checkpoint đồng bộ chung của WAL mode, xảy ra với BẤT KỲ khối lượng ghi nào đủ lớn vào
  bất kỳ bảng nào trong db, không phải do JSON blob của `pairing.games`/`.moves` tăng dần. Ngoài
  phạm vi mục này (xem "Không thuộc phạm vi" — không đổi cấu trúc bảng ở đây); nếu muốn xử lý,
  đó là một mục riêng về cấu hình WAL checkpoint của toàn db, không phải về `savePairing()`.

**Kết luận:** giả thuyết ban đầu (stringify toàn bộ blob mỗi lần ghi là nguyên nhân chặn event
loop đáng kể) **không đúng ở quy mô dữ liệu thực tế của game này** — kể cả ở kịch bản cực đoan
(bàn 20×20 đầy, series 99 ván) chi phí vẫn dưới 0.3ms mỗi lần ghi, không giải thích được độ trễ
"navigate/comein/out" người dùng báo cáo. Không sửa `savePairing()` theo mục này. Nguồn độ trễ
thật (nếu còn) nằm ở lớp khác — xem các mục #81-#84 (đã xử lý) và
[tournament-navigation-latency-report.md](../tournament-navigation-latency-report.md) cho các mục
còn lại chưa đóng.
