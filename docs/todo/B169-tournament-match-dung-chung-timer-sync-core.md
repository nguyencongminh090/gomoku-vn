# B169 — `tournament-match.js` dùng chung `timer-sync-core.js`

**Trạng thái:** ⬜ CHƯA LÀM — tách ra từ B168 Bước 1 (2026-08-28), **không** gộp vào B168.

**Severity:** Low. Không phải bug người dùng thấy được; là nợ trùng lặp + 1 lỗi lệch 1ms.

**Platform:** Mọi nền (trang `tournament-match.html`).

**Reported by:** Phát hiện trong lúc làm B168 Bước 1 — sau khi phòng chơi thường đã
chuyển sang `client/js/timer-sync-core.js`, `tournament-match.js` là bản sao duy nhất còn
lại của cùng biểu thức đồng hồ.

---

## Vấn đề

`client/js/tournament-match.js` giữ bản sao riêng của toàn bộ maths đồng hồ mà
`room-socket.js`/`game-ui.js` **đã** chuyển sang gọi `timer-sync-core.js` ở B168 Bước 1:

- `applyTimerSync()` (dòng ~553): `clockOffsetMs = (sync.serverTime || Date.now()) - Date.now();`
  — đọc đồng hồ hệ thống **hai lần**. Nhánh dự phòng (`timer:sync` không kèm `serverTime`)
  vì thế cho ra `-1` thay vì đúng `0`: 1ms skew ảo, áp vào mọi `serverNow()` cho tới lần
  sync kế tiếp. B168 đã sửa đúng chỗ này cho phòng thường bằng cách đọc 1 lần
  (`TimerSyncCore.clockOffsetMs`).
- `tickLocal()` (dòng ~530): tính `remaining` riêng, **không** có phần bù transit-delay
  #165/#166 mà phòng thường có → đồng hồ giải đấu hiển thị lệch so với phòng thường trên
  cùng một đường mạng.

## Vì sao KHÔNG làm trong B168

`docs/todo/B168-*.md` §"Ngoài phạm vi" và `docs/instruction/B168-*.md` R3 nói rõ:
`tournament-match.js` **không đụng** (đã hoãn từ #165/#166). Sửa kèm sẽ vượt ranh giới
đã chốt của B168 và mở rộng bán kính rủi ro của bước extraction rủi ro nhất. Ghi nhận
riêng ở đây theo đúng rule "scope discipline" của `CLAUDE.md`.

## Việc cần làm

1. `tournament-match.html` nạp `js/timer-sync-core.js` bằng thẻ `<script>` cổ điển
   (giống `room.html`) — **không** import trong `tournament-match-entry.js` (bẫy UMD bị
   Vite commonjs bọc lười, #65).
2. `applyTimerSync()` → `TimerSyncCore.clockOffsetMs(sync.serverTime, Date.now())`.
3. `tickLocal()` → `TimerSyncCore.compensatedRemainingSec(...)`.
4. **Quyết định trước khi làm bước 3:** trang giải đấu hiện **không** đo half-RTT (không
   có `recordMoveRtt` tương đương). Hoặc (a) chỉ sửa `clockOffsetMs`, truyền `0` cho
   half-RTT — sửa lỗi 1ms, chưa mang #165 sang; hoặc (b) mang cả phần đo RTT sang cho
   đồng hồ hai trang khớp nhau. (b) là việc thật, cần hỏi người dùng trước.
5. Mở rộng `timer-sync-conformance.test.js`: thêm `tournament-match.js` vào danh sách
   file bị cấm giữ bản sao biểu thức.
6. Bump `?v=N` (có sửa `client/js` + `client/*.html`).

## Test

- `client/tests/` (jsdom): đã có `tournament-match-board-resize.test.js` +
  `tournament-match-leave-lock.test.js` nạp module này — thêm case cho `applyTimerSync`
  (`serverTime` thiếu ⇒ offset đúng `0`) và cho `tickLocal`.
- `timer-sync-conformance.test.js`: file thứ ba vào danh sách grep-assert.
- Verify trình duyệt thật một trận giải đấu (`playwright-e2e-safety`) — không chỉ jsdom.

## Ngoài phạm vi

- Bất kỳ thay đổi nào khác của `tournament-match.js` ngoài đồng hồ.
- Bounded refund (#167) — trang này chỉ hiển thị, server vẫn là nguồn timeout duy nhất.
