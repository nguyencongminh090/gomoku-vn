# B167 — Hướng dẫn thực thi

**Đây là task KHẢO SÁT. Dừng và hỏi người dùng sau bước 1 (đo) trước khi viết code triển khai.**

## Bước 1 — Đo (bắt buộc, không bỏ qua)

- Instrument tạm trong `GameHandler` `game:move` path: log `turnStart` (monotonic, `process.hrtime`),
  `serverRecv`, `serverRecv − turnStart`, và `measuredHalfRTT` từ `io.engine` ping/pong của socket
  đó. Chạy trên production một khoảng đủ mẫu (ưu tiên bắt được người chơi Mỹ/TQ latency cao).
- Phân tích: phần mất mát là do transit delay (giây, B165 xử lý) hay do RTT thật người chơi phải trả
  (chục–trăm ms)?
- **Nếu B165 đã làm người chơi hết phàn nàn → đóng B167 "Đã đóng: không cần".**
- **Kênh lấy mẫu (đã dựng 2026-08-28):** ngoài harness `LOG_MOVE_LAG` (production, cần deploy), dùng
  trang chẩn đoán **#168** (`/diag`, không công khai) — gửi URL cho người chơi Mỹ/TQ tự chạy, không
  cần deploy gì thêm. Đọc kết quả từ `server/data/diag-results/*.jsonl` (nguồn chân lý — mỗi lần gửi
  1 dòng, gồm `run.halfRttMs` p50/p90/p99, `run.spentFloorMs`, `run.timerHandoffMs`, `geo`, `ip`,
  `feedback`) hoặc `grep '\[DiagResult\]' <log>`. Đường solo ghi thêm `[DiagResult move]` mỗi nước
  với `spent_ms` (mốc monotonic, `process.hrtime`) trên `TimerManager` thật `per_game`. So `spent_ms`
  sàn với half-RTT: RTT vài chục ms + `spent_ms` sát số nguyên giây → drift → đóng B167; RTT
  150–300ms+ và người chơi phàn nàn bị trừ giờ → Bước 2.
- **Spec Bước 2 dưới đây không đổi vì #168.** Trang chẩn đoán chỉ đo; không có timestamp/half-RTT
  client nào của nó vào công thức timeout. Nếu Bước 2 được làm, `clientTs` vẫn chỉ cross-check.

## Trạng thái sau mẫu `/diag` lần 2 (2026-08-28) — ĐỌC TRƯỚC

5 mẫu đầu đã về (`server/data/diag-results/2026-08-28.jsonl`). Chi tiết số ở
`docs/todo/B167-*.md` mục "Kết quả đo lần 2". Ba điều ảnh hưởng trực tiếp tới cách thực thi:

- **Đã loại được một giả thuyết:** `timerHandoffMs ≈ moveConfirmMs` ở cả 5 lượt ⇒ chặng bàn giao
  c→s→c không thêm chi phí ngoài RTT của ack. **Đừng đi tối ưu đường bàn giao** — dữ liệu nói không
  phải chỗ đó.
- **OQ1 chặn Bước 2 (cứng).** Spec đòi `measuredHalfRTT` đo **server-side mỗi nước**, nhưng nguồn
  được chỉ định (engine.io ping/pong) phủ 3/17 nước (`pingInterval = 25s`, không được hạ — bẫy
  #147/#152), và `crtt` do client khai **chỉ được cross-check**. ⇒ Hiện **không có nguồn hợp lệ để
  nuôi công thức refund**. Nếu bạn định bắt đầu Bước 2: dừng lại, chốt OQ1 với người dùng trước.
  Hướng đáng cân nhắc nhất là mượn đúng cơ chế `diag:ping`/`diag:pong` của #168 (đã chứng minh phủ
  được ~mỗi 500 ms trong ván thật) — nhưng vẫn phải hỏi, vì nó thêm message type vào phòng chơi.
- **OQ2 — đừng vội sửa `HARD_CAP`.** 250 ms dẫn xuất từ giả định ~500 ms round-trip; số đo thật đầu
  tiên là half-RTT p50 376 / p90 659. Cám dỗ là nâng cap ngay — **không**. Một điểm dữ liệu không
  phải phân bố (rule "đừng chọn số tròn" cấm cả hai chiều). Thu thêm mẫu `/diag` rồi mới hiệu chuẩn.

**Việc tiếp theo của #167 là *thu thêm mẫu*, không phải viết code.** Nếu người dùng muốn giảm khó
chịu ngay, hướng đúng là **#169** (làm mượt hiển thị) — cùng dữ liệu, khác tầng, rủi ro thấp hơn
nhiều, và đóng đúng vai #165 đã đóng lần trước.

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
