# Fix log entry — 2026-08-28 21:11

## Prompt

"Do #169" — sau khi phân tích 5 mẫu `/diag` đầu tiên, lượt người chơi TQ trên 3G
(jitter half-RTT 199,6 ms vs 1,7–15,9 ms ở 4 lượt VN) cho thấy đồng hồ phòng chơi
giật/nhảy ~1 giây trên kết nối jitter cao. Người dùng chọn phạm vi "A3 + A1, dải
đệm 250 ms".

## Action

Client-only, nối tiếp #165/#166 — `TimerManager`/`getSync()`/server **không đổi**;
`activeDeadline`/`serverNow()`/`clockOffsetMs`/`armTurnWatchdog` không đổi (ranh
giới #165: không giá trị nào ở đây quyết định timeout).

Nhánh: `fix/timer-clock-display-jitter` off `dev` (code `timer-sync-core.js` +
entry #169 chỉ có trên `dev` sau khi merge `feature/diag-latency-page` — merge đó
nằm ngay trước trong cùng session).

**A1 — hysteresis cho `displayShaveSec` (`client/js/timer-sync-core.js`):**

- Thêm hằng `SHAVE_HYSTERESIS_SEC = 0.25` — ¼ tick 1000 ms của phòng, **dẫn xuất
  từ granularity tick giống hệt cách `diag-report.js` lấy ngưỡng jitter**, KHÔNG
  từ mẫu CN (1 điểm dữ liệu). Ghi rõ trong comment là tạm, revisit khi có thêm mẫu.
- `displayShaveSec(halfRttMs)` → `displayShaveSec(halfRttMs, prevShaveSec?)`.
  - Gọi 1 tham số = **y nguyên** `Math.round(transitDelaySec())` tiền-#168 — khối
    "room-parity" trong `timer-sync-core.test.js` vẫn so với dạng này, không đổi.
  - Gọi 2 tham số: giữ bậc cũ tới khi `|target − prevShaveSec| > 0.5 + 0.25`;
    khi đó mới `Math.round` lại (nhảy lớn snap thẳng, không từng bậc). Bậc
    0→1 ở half-RTT > 750 ms, 1→0 ở < 250 ms; dải [250, 750] giữ nguyên.

**A3 — kẹp đơn điệu trong lượt (`client/js/room-socket.js`):**

- State module mới: `lastShaveSec` (nuôi hysteresis, bền qua lượt — bám mạng chứ
  không bám lượt), `clampSec`/`clampColor` (giá trị whole-second cao nhất được
  phép hiển thị cho đồng hồ đang chạy trong lượt này).
- Helper `clampActiveDisplay(color, computedSec)`: đồng hồ đang chạy **không bao
  giờ nhảy LÊN** trong một lượt — flip shave do jitter hay `timer:sync` bị đảo
  thứ tự chỉ được hấp thụ xuống. Gọi ở **cả** `tickLocal` (đường tick mỗi giây)
  **và** `applyTimerSync` (giá trị mở màn).
- Điểm reset `clampSec = null`: đổi lượt (`sameColor` false), unpause
  (`!sync.running`), server đẩy deadline ra xa (`sync.deadline > activeDeadline +
  TIME_GRANTED_MARGIN_MS`, margin = 2000 ms — dưới grant nhỏ nhất, trên jitter
  gói/drift sync-to-sync). Bonus time do đó hiện ngay, không kẹt 1 lượt.
- `applyTimerSync` viết `st.timerValues` qua `activeShown` (đã clamp+shave) thay
  vì ghi thẳng `sync.black - shave`. Nhánh `!sync.running` vẫn là giá trị chính
  xác không shave (như #165).
- Log `gvn_timer_debug` thêm `clampSec`.

**Mobile players-strip:** không đụng — `room-ui.js` đọc `st.timerValues` qua
`GameUI.effectiveTimerValues()` (#166), đã mang sẵn giá trị clamp.

**`.claude/rules/diagnostic-page-sync.md` mục (b):** cập nhật header
`diag-report.js` — ngưỡng jitter 100/250 ms giữ nguyên (vẫn là tín hiệu chất
lượng link thật), nhưng ghi chú #169 đã lấy đi phần "unsteady" tệ nhất; revisit
threshold khi có thêm mẫu jitter cao.

## Đánh đổi (đã ghi ở `docs/todo/B169-*.md`)

Kẹp đơn điệu ở `tickLocal`: sau một spike RTT thật, đồng hồ có thể **giữ nguyên
1–2 giây** trong lúc wall-time đuổi kịp, rồi chạy tiếp. Đọc như một cú hiccup —
chấp nhận được, khác hẳn cú nhảy ngược mà nó thay thế (người chơi đọc là "game
hỏng"). Không bao giờ hiển thị **ít hơn** giá trị server-đã-bù (giữ nguyên tắc
#165 "không lấy đi giây người chơi có thể có").

Ngoài phạm vi: bàn cờ "dính" ~1 giây sau mỗi nước (`moveConfirm.p50` 891 ms trên
3G) — RTT vật lý, không sửa bằng code hiển thị. Giờ thật bị trừ cho transit = #167.

## Test

- `server/tests/timer-sync-core.test.js` +9 case: describe "hysteresis around the
  rounding boundary (#169)" — dead zone giữ bậc, step up/down chỉ khi vượt
  `0.5 + 0.25`, nhảy lớn snap thẳng, clamp 8 s, chuỗi parked-on-500ms không
  flip-flop. Khối room-parity thêm comment ghi rõ dạng 1-tham-số bất biến.
- `client/tests/game-optimistic-render.test.js` +5 case: describe "#169 — clock
  does not stutter or bounce" — EMA parked ở 500 ms cho countdown 1-mỗi-sync,
  sync stale-high không bật đồng hồ lên, đổi lượt reset clamp (đối thủ thấy đồng
  hồ đầy), bonus time (deadline đẩy ra) reset clamp, shave 1→0 giữa lượt không
  nhảy lên. Bơm chuỗi `halfRttMs` nhiễu như CLAUDE.md yêu cầu, assert dãy hiển
  thị chứ không phải "không throw".
- `npm test` **1844/1844** (88 suite, +13). Từ 1831 sau khi merge #168.

## Decision

- Deadband từ tick phòng (¼ × 1000 ms), không từ mẫu CN — hợp lệ mà không cần
  chờ thêm dữ liệu. Đánh dấu provisional để revisit.
- Hysteresis opt-in qua tham số thứ 2 ⇒ không phải sửa kỳ vọng test cũ nào; dạng
  1-tham-số của core vẫn là biểu thức tiền-#168 cho parity với `/diag`.
- `?v=169→170` toàn repo (grep đúng 1 giá trị, gồm `client/js/diag/`).
- `fix/timer-clock-display-jitter` → merge `dev` (không lên `main` — code phụ
  thuộc chỉ có trên `dev`). #170 (readyDeadline `Date.now()`) là task riêng, chưa làm.

## Summary output

#169 sửa xong: A1 hysteresis (`displayShaveSec` + `SHAVE_HYSTERESIS_SEC=0.25` =
¼ tick) + A3 kẹp đơn điệu (`clampActiveDisplay` ở `tickLocal` + `applyTimerSync`,
reset ở đổi lượt/unpause/bonus). Client-only, server + ranh giới #165 không đổi.
Mobile tự hưởng qua helper #166. `?v=170`. `npm test` 1844/1844 (+13). Đánh đổi:
đồng hồ có thể giữ 1–2 s sau spike RTT thật (hiccup, không nhảy ngược). Nhánh
`fix/timer-clock-display-jitter` off `dev`.
