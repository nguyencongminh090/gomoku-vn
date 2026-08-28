# B167 — (Khảo sát) Server-side lag compensation cho `game:move`

**Trạng thái:** ⬜ ĐANG KHẢO SÁT — **harness đo (Bước 1) đã dựng 2026-08-28; chờ mẫu production.
Chưa động vào công thức tính giờ.**

**Severity:** Low — B165 đã xử lý phần *hiển thị* (người chơi hết thấy nhảy). B167 chỉ thêm phần
*công bằng giờ thật*: người chơi không bị trừ giây cho quãng nước đi kẹt trên đường mạng.
**Platform:** Mọi nền tảng, rõ nhất ở kết nối 150–300ms+ (báo cáo gốc: người chơi TQ #155, người
chơi Mỹ + VPN #165).
**Reported by:** Thảo luận architect 2026-08-28 — người dùng hỏi về "client gửi timestamp lúc click".

---

## Bước 1 — ĐO trước (bắt buộc, theo rule #131 "đừng chọn số tròn")

- Log `spent = serverRecv − turnStart` và `measuredHalfRTT` (từ `io.engine` ping/pong) cho một mẫu
  nước đi thật trên domain production.
- Nếu mất mát chủ yếu cỡ-drift (giây, do transit delay) → **B165 là đủ**, đóng B167.
- Nếu mất mát cỡ-RTT thật (chục–trăm ms) và người chơi phàn nàn bị trừ giờ → sang bước 2.

### Harness đã dựng — `feature/move-lag-measurement` off `dev` (2026-08-28)

- **Bật:** đặt `LOG_MOVE_LAG=true` (hoặc `1`) trong môi trường server production. Tắt mặc định —
  không có flag thì toàn bộ module `server/utils/move-lag.js` trơ (không ghi map, không log, không
  gắn listener engine.io). Cùng quy ước với `LOG_HTTP` (#164).
- **Mỗi nước đi được chấp nhận** → 1 dòng logfmt `msg="[MoveLag]"` với:
  - `spent_ms` — thời gian thực (wall) đồng hồ người đi chạy trên server, đo bằng mốc **monotonic**
    `process.hrtime.bigint()` đặt lúc đổi lượt (không dùng `Date.now`). Gồm think-time + chân
    **tải-lên** nước đi.
  - `half_rtt_ms` — nửa RTT của socket đó, đo **server-side** từ gói `ping` server gửi tới `pong`
    client trả (engine.io protocol v4). Không cần client hợp tác, không thêm packet type — khác
    #165 nơi client không đọc được vì client không khởi xướng heartbeat.
  - `mode` (`per_game`/`blitz`/`per_move`), `room`, `user`, `ip`, `geo` (nhãn Cloudflare #164).
- **Đọc kết quả:** `grep '\[MoveLag\]' <log> | ...` — ưu tiên các dòng `geo` ngoài VN / `half_rtt_ms`
  cao (người chơi Mỹ/TQ). So `half_rtt_ms` với phần lẻ giây của `spent_ms`:
  - `half_rtt_ms` chỉ vài chục ms, `spent_ms` sát số nguyên giây kỳ vọng → mất mát là **drift**,
    #165 đã đủ → **đóng B167 "Đã đóng: không cần"**.
  - `half_rtt_ms` cỡ 150–300ms+ và người chơi phàn nàn → phần tải-lên (`≈ half_rtt_ms`) là giờ thật
    bị trừ oan → **sang Bước 2** (hoàn bounded).
- **Chưa làm ở Bước 1 (cố ý):** không gửi `clientTs` từ client — sẽ phải sửa `client/js/` + bump
  `?v=N` toàn repo cho một probe tạm. `clientTs` cross-check là việc của Bước 2.
- **Gỡ harness:** xoá `server/utils/move-lag.js` + `server/tests/move-lag.test.js` + 8 call site
  `moveLag.*` trong `server/socket/handlers/GameHandler.js` (đều có comment `TEMP — TODO.md #167`).
- Server-only ⇒ **không bump `?v=N`**. Test: `server/tests/move-lag.test.js` (26 case — gating,
  biên `spentMs`, cặp ping/pong). `npm test` 1497/1497.

## Bước 2 — Nếu làm: spec bắt buộc (an toàn)

**Server vẫn là nguồn chân lý duy nhất cho timeout.** `clientTs` chỉ để cross-check, KHÔNG vào công
thức tính giờ (`Date.now()` client là wall-clock — user/NTP chỉnh được).

| Ràng buộc | Cách làm |
|---|---|
| Mốc thời gian | Server tự ghi `turnStart` bằng `process.hrtime`/monotonic — không dùng `Date.now` |
| Công thức | `spent = serverRecv − turnStart`; `refund = min(measuredHalfRTT, HARD_CAP≈250ms, remainingLagBudget)`; `spent -= refund` |
| Đo lag | Từ socket.io ping/pong **server-side**, KHÔNG từ số client khai |
| Chặn "suy nghĩ vô hạn" | Bắt buộc clamp; `refund` không bao giờ vượt `HARD_CAP` |
| Chặn farm-lag (giả latency cao) | **Lag-budget/ván** (vd tổng refund ≤ 10s như Lichess); hết budget thì refund = 0 |
| Monotonic | Từ chối nước có `clientTs` lùi so với nước trước (nếu dùng `clientTs` để cross-check) |

**Thiệt hại tối đa nếu làm đúng** = `HARD_CAP × số nước` ≈ vài giây/ván, và đó là hoàn lại độ trễ
người chơi **đã thực trả** — chấp nhận được. Rủi ro chỉ xuất hiện khi **quên clamp** hoặc **tin số
client khai thay vì đo**.

---

## Liên quan

- **#165** — tiền đề; phần hiển thị. B167 là phần "giờ thật", tách hẳn (khác tầng, khác rủi ro).
- **#10 / TimerManager** — `getSync`/`applyMove`; điểm chèn refund là trong `startTimerForGame`
  `onTimeout`-path và `switchTurn` của `TimerManager`.
- Rule CLAUDE.md "Security findings: verify against current code" + "Root-cause diagnosis".
