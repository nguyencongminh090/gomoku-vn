# B167 — Hướng dẫn thực thi

**Đây là task KHẢO SÁT. Dừng và hỏi người dùng sau bước 1 (đo) trước khi viết code triển khai.**

## Bước 1 — Đo (bắt buộc, không bỏ qua)

- Instrument tạm trong `GameHandler` `game:move` path: log `turnStart` (monotonic, `process.hrtime`),
  `serverRecv`, `serverRecv − turnStart`, và `measuredHalfRTT` từ `io.engine` ping/pong của socket
  đó. Chạy trên production một khoảng đủ mẫu (ưu tiên bắt được người chơi Mỹ/TQ latency cao).
- Phân tích: phần mất mát là do transit delay (giây, B165 xử lý) hay do RTT thật người chơi phải trả
  (chục–trăm ms)?
- **Nếu B165 đã làm người chơi hết phàn nàn → đóng B167 "Đã đóng: không cần".**
- **Kênh lấy mẫu (2026-08-28):** ngoài harness `LOG_MOVE_LAG`, dùng trang chẩn đoán **#168**
  (`/diag`) — gửi URL cho người chơi Mỹ/TQ tự chạy. `[DiagResult]` + đường solo `[DiagResult move]`
  cung cấp `spent_ms` vs half-RTT trên `TimerManager` thật. So phần lẻ giây của `spent_ms` với RTT:
  RTT vài chục ms + `spent_ms` sát số nguyên giây → drift → đóng B167; RTT 150–300ms+ và người chơi
  phàn nàn bị trừ giờ → Bước 2.

## Bước 2 — Chỉ khi số đo + người dùng đồng ý

Tuân thủ tuyệt đối spec an toàn trong `docs/todo/B167-*.md`:

- Server là nguồn chân lý timeout duy nhất. `refund` chỉ *giảm* `spent`, có `HARD_CAP` + lag-budget/ván.
- Đo lag **server-side** (ping/pong), không tin số client khai.
- `clientTs` (nếu nhận): chỉ cross-check + kiểm monotonic, không vào công thức.
- Điểm chèn: `TimerManager` — thêm method `applyMoveWithRefund(movedColor, refundMs)` hoặc tham số
  `refundMs` cho `applyMove`; không rải logic giờ ra `GameHandler`.

## Pitfalls

- Quên clamp `refund` → "suy nghĩ vô hạn". Đây là lỗi nghiêm trọng nhất, test case đầu tiên phải là
  `clientTs = turnStart` → refund vẫn ≤ HARD_CAP.
- `Date.now()` client trong payload: wall-clock, user chỉnh được. Không dùng làm mốc.
- Chế độ `per_move`: refund vào clock rồi lại bị reset — cân nhắc bỏ refund cho `per_move` (vô nghĩa).
- Không siết `pingInterval`/`pingTimeout` toàn cục để "đo lag tốt hơn" — đó là bẫy TODO #147/#152 đã
  cảnh báo.

## Test

- Bảng quyết định: `{claimedLag, measuredLag, budgetRemaining} × {trong cap, vượt cap}` → `refund`
  kỳ vọng. Boundary: `refund` tại đúng `HARD_CAP`, budget = 0, budget vừa đủ 1 refund.
- Server Jest `server/tests/TimerManager.test.js`.
