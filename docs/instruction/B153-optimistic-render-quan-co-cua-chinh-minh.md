# B153 — Hướng dẫn thực thi: optimistic render cho quân cờ của chính mình

**Việc:** `docs/todo/B153-optimistic-render-quan-co-cua-chinh-minh.md`

---

## ⚠️ Điều kiện tiên quyết — đọc trước mọi thứ khác

**KHÔNG được implement #153 trước khi #152 xong.**

Optimistic render mà thiếu ack/timeout của #152 sẽ biến freeze từ "thấy rõ" thành "âm thầm": người
chơi thấy quân mình hiện ra bình thường, tưởng nước đi thành công, nhưng server chưa hề nhận được —
họ ngồi chờ đối thủ trong một ván mà lượt vẫn thuộc về mình, không có gì báo sai. **Đây là hồi quy
thật, tệ hơn hiện trạng.**

Nếu ai đó nhận #153 mà #152 chưa xong: dừng lại, làm #152 trước, hoặc gộp cả hai thành một đợt.

---

## Đã trace xong — đừng đào lại

Đường click→vẽ đã được xác minh đầy đủ, kết luận:

- `client/js/game-ui.js:97-110` — `onCellClick` **chỉ** emit, không vẽ gì.
- Server broadcast bằng `io.to(roomId).emit('game:moved')` (`GameHandler.js:54-108`) — **cho cả
  phòng, kể cả người vừa đi**, không phải `socket.emit` riêng.
- `client/js/room-socket.js:211-245` mới là chỗ board được cập nhật + vẽ.
- **Không có độ trễ giả nào**: `setState()` (`board.js:107`) gọi thẳng `_draw()` (`board.js:127`) đồng
  bộ; bàn cờ là `<canvas>` nên không có CSS transition per-stone; các `setTimeout` gần đó
  (`room-socket.js:144, 149, 156`, 1500ms) là redirect sau khi phòng đóng/bị kick, không liên quan.

⇒ ~0.5s là RTT thật. **Đừng đi tìm timer ẩn, không có.**

---

## Ranh giới — "đừng làm"

- **Đừng nhân bản logic `GameEngine` sang client.** Kiểm tra phía client chỉ được ở mức **tối thiểu**:
  đúng lượt mình + ô trống + trong bàn + không phải tường. **Tuyệt đối không** nhân bản `_checkWin`
  hay logic thắng/thua — server vẫn là nguồn chân lý duy nhất, và luật nhân bản là mầm mống divergence
  không ai phát hiện cho tới khi hai bên hiển thị khác nhau giữa ván.
- **Đừng bật optimistic cho nhánh Swap2 opening.** `GameHandler.js:714-741` khởi tạo game Swap2 với
  `color: null` cho cả hai người — **màu chưa được gán**, chỉ resolve sau `GameEngine.swap2Choice` +
  `timer.remapForSwap2()`. Client không biết vẽ quân đen hay trắng. Nhánh này **giữ nguyên hành vi
  chờ-server**, không cố "đoán" màu.
- **Đừng giả định luật portal không đổi vị trí quân.** Đọc code hiện tại thì `movePayload` dùng lại
  đúng `x, y` từ request (gợi ý là không relocate), **nhưng chưa kiểm chứng**. Phải xác minh trước.
  Nếu portal có relocate → tắt optimistic khi `rulePortal` bật, vì vẽ sai chỗ rồi nhảy chỗ khác còn tệ
  hơn chờ 0.5s.
- **Đừng đụng đường `game:moved`/`room:joined` hiện có.** Optimistic là **lớp thêm vào phía trước**;
  đường xác nhận từ server phải tiếp tục hoạt động y nguyên, kể cả khi optimistic bị tắt.
- **Đừng mở rộng optimistic sang thao tác khác** (ngồi ghế, ready, undo, chat). Báo cáo gốc chỉ nói
  về đặt quân.

---

## Bẫy kỹ thuật

1. **Quân pending phải nhìn KHÁC quân xác nhận.** Bán trong suốt / viền nét đứt — trung thực với
   người chơi (chưa chắc chắn) và làm rollback đỡ giật cục. Đừng vẽ y hệt quân thật rồi âm thầm gỡ đi
   khi server từ chối.

2. **Ba đường kết thúc, phải xử lý đủ cả ba:** ack `ok` / `game:moved` → xác nhận; ack `error` → gỡ
   pending + hiện lý do; timeout (#152) → giữ pending ở trạng thái cảnh báo + gọi `game:resync`.
   Thiếu đường nào cũng để lại quân pending mắc kẹt trên bàn.

3. **Coi chừng double-apply.** Quân đã vẽ optimistic, rồi `game:moved` về cho **chính nước đi đó** —
   `room-socket.js:228` sẽ gán lại `board[y][x]`. Phải đảm bảo hoà giải idempotent (gán lại cùng giá
   trị thì vô hại, nhưng nếu có counter/moveCount phía client thì đừng tăng hai lần).

4. **`game:moved` là broadcast cho cả phòng** — người vừa đi cũng nhận. Đừng viết logic kiểu "nếu là
   nước của mình thì bỏ qua `game:moved`", vì đó chính là đường xác nhận. Hoà giải, đừng lọc bỏ.

---

## Test

**Client (`client/tests/` — hạ tầng đã có, theo pattern `board-touch-scroll-prevention.test.js`):**
- Click ô hợp lệ → board có quân pending **ngay**, không chờ event server
- `game:moved` về → pending chuyển thành xác nhận, không nhân đôi quân
- ack `error` về → pending bị gỡ, board trở lại đúng trạng thái trước click
- Click khi **không phải lượt mình** → không vẽ pending, không emit
- Click ô **đã có quân** → không vẽ pending
- **Swap2 opening**: click → **không** vẽ pending (giữ hành vi chờ-server)

⚠️ `CLAUDE.md` ghi "client-side `client/js/` currently has none [test infra]" — **đã cũ**, có
`client/tests/` với 3 file đang chạy.

**Server:** #153 về nguyên tắc không đổi server. Nếu buộc phải đổi → viết Jest tương ứng và nói rõ vì
sao phạm vi bị mở rộng (rule `CLAUDE.md`: lệch `instruction.md` thì ghi lý do vào summary).

**Kiểm chứng test không rỗng:** bỏ bản sửa ra, test phải fail. Ghi số fail vào summary.

---

## Verify thật (bắt buộc)

- Chromium thật qua `playwright-e2e-safety`, instance **cô lập** (copy repo + DB tạm + cổng riêng —
  không đụng DB/server thật).
- **Đo lại độ trễ cảm nhận trước/sau**: thời gian từ click đến pixel quân xuất hiện. Đây là con số
  duy nhất chứng minh #153 có tác dụng — nếu không đo được, nói thẳng là không đo được (tiền lệ #126:
  đã làm đúng nhưng không tách được mili-giây khỏi nhiễu đo, và đã ghi trung thực như vậy).
- **Verify cả trên latency cao**, không chỉ localhost (localhost RTT ~0ms sẽ khiến optimistic render
  trông như không làm gì). Dùng network throttling để mô phỏng RTT ~500ms.
- Kiểm tra rollback trực quan: ép server từ chối một nước đi, xem quân pending có biến mất sạch không.

---

## Bắt buộc khi đụng `client/`

**Bump `?v=N` → `?v=N+1` toàn repo** — cả `client/*.html` lẫn **mọi `import '...?v=N'` chéo giữa các
module trong `client/js/*.js`**. Completion check là grep trong `CLAUDE.md`, phải ra **đúng một** giá
trị. (Nếu làm chung đợt với #152 thì bump **một lần**, không bump hai lần.)

---

## Git

Cùng lớp vấn đề với #152, có trên cả `main` lẫn `dev` ⇒ branch off **`main`** theo `git-workflow`
skill. Nếu gộp chung đợt với #152 thì dùng chung một branch, nhưng **hai commit tách bạch** (đúng
quy ước one-commit-per-fix).
