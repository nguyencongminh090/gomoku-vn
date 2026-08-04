# B8. Bỏ `settings` khỏi `room:updated` (review 4.2)

### B8. Bỏ `settings` khỏi `room:updated` (review 4.2)

- Có **17 điểm emit** `room:updated` được reviewer liệt kê theo review 4.1 (số
  điểm gọi `broadcastLobbyUpdate` liên quan) — khi sửa, đối chiếu đủ danh sách
  gốc trong `issue report.md` mục 4.1/4.2, không chỉ sửa những chỗ tình cờ gặp
  khi grep.
- Xa hơn (không bắt buộc trong lượt sửa rẻ): delta kiểu "user X đổi slot" thay
  vì chỉ bỏ settings — reviewer liệt kê đây là bước xa hơn, không phải yêu cầu
  bắt buộc của "thắng nhanh nhất".

**✅ Bước "xa hơn" đã làm (2026-08-03)** — xem TODO.md #8 (cập nhật) và
`docs/fix-log.md`. Tái dùng đúng kỹ thuật diff-tại-lúc-phát của `lobby:patch`
(mục 9) thay vì nghĩ ra cơ chế mới — áp cho `users[]`/`scoreTable` của
`room:updated`. Bài học giữ lại cho lần sau nếu làm delta cho một broadcast
khác trong repo này:

- **Test guard "đếm đủ N điểm emit" phải cập nhật theo cùng nhịp với refactor
  call site, không phải viết lại từ đầu.** `RoomManager.test.js` đã có sẵn 1
  test quét source đếm đúng 17 điểm gọi `serializeRoomUpdate(` trực tiếp (từ
  lúc làm mục 8 bản đầu) — khi 17 điểm đó đổi sang gọi qua
  `broadcastRoomUpdate(io, ...)`, test cũ **tự động đỏ** (đúng, không phải
  regression) vì không còn khớp pattern cũ. Phải sửa lại chính test đó để
  quét đúng pattern mới, không phải xoá nó đi.
- **Mock `../state` wholesale ở các suite khác (`LobbyHandler.test.js`,
  `DisconnectHandler.test.js`) cũng phải thêm hàm mới vào mock**, nếu không
  gọi hàm thật undefined sẽ throw ngay khi handler chạy — lỗi này dễ nhầm là
  bug thật ("TypeError: X is not a function") nếu không nhớ có bao nhiêu chỗ
  mock `../state` toàn bộ module thay vì import lẻ.
- **Restart server dev trước khi tin bất kỳ kết quả e2e nào sau khi sửa code
  server-side.** Server không dùng `--watch`/nodemon trong lượt chạy thường,
  nên Node giữ module cũ trong bộ nhớ dù file trên đĩa đã đổi — trong khi
  client là static file, đọc lại mỗi request. Sửa cả 2 phía (như delta này)
  mà chỉ restart... không restart thì ra lỗi "phối hợp lệch" trông y hệt một
  regression thật (ví dụ: `#room-id-nav` trống trơn) nhưng thực ra là do phía
  server đang chạy code review cũ.
- **Chạy `e2e/*.spec.ts` dồn hết một lượt trên 1 tiến trình server sẽ đụng
  `MAX_ROOMS_PER_IP=3`** vì mọi Playwright browser context trên cùng máy test
  đều chung 1 IP loopback — đúng giới hạn đã ghi trong
  `scripts/capacity-test/README.md`, không phải bug. Cách xác nhận nhanh:
  chạy riêng đúng 1 file bị fail ngay sau khi restart server sạch — nếu xanh
  thì là quota, không phải regression. Muốn chạy an toàn cả bộ: theo từng
  nhóm nhỏ (≤3 phòng tạo mới) rồi restart giữa các nhóm.
