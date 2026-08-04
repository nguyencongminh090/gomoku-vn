# B18. Tạo phòng "flash" sang room.html rồi bị đá về lobby khi đụng quota IP (mục 7)

### B18. Tạo phòng "flash" sang room.html rồi bị đá về lobby khi đụng quota IP (mục 7)

- Đây **không phải** lỗi ở quota (`MAX_ROOMS_PER_IP`, mục 7) — quota hoạt động
  đúng thiết kế. Vấn đề nằm ở `submitCreate()` (`client/js/lobby.js`, ~dòng
  406): điều hướng sang `room.html` **ngay khi bấm nút**, trước khi biết
  `room:create` thành công hay không. Nếu bị từ chối, người dùng thấy trang
  nhấp nháy sang `room.html` rồi ~1.5s sau tự động về lại `index.html`
  (`room-socket.js` xử lý `room:error`, dòng ~91-104) — dễ hiểu lầm là app bị
  lỗi/đứng thay vì "tạo phòng thất bại vì bạn còn phòng cũ chưa đóng".
- Hướng sửa gợi ý (chưa chốt, cần quyết định khi làm): chờ `room:create`
  emit-with-ack (hoặc lắng nghe `room:joined`/`room:error` trước khi điều
  hướng) rồi mới chuyển trang, thay vì điều hướng lạc quan trước. Cân nhắc
  giữ UX "một click là vào phòng" cho trường hợp thành công (đa số) — chỉ trì
  hoãn điều hướng đủ để bắt được lỗi tạo phòng, không phải chờ round-trip đầy
  đủ của toàn bộ `room:joined` payload nếu điều đó làm chậm cảm nhận rõ rệt.
- Kịch bản để test lại: tạo phòng → mời người khác vào → tự rời phòng (người
  kia không rời) → lặp lại đủ số lần chạm `MAX_ROOMS_PER_IP` (mặc định 3) →
  tạo phòng lần nữa. Đã có sẵn tái hiện tự động ở
  `e2e/leave-then-create-room.spec.ts` — chạy trước khi sửa để thấy đúng hành
  vi lỗi, chạy lại sau khi sửa để xác nhận không còn "flash" sang room.html
  khi bị từ chối (ví dụ: assert không còn đi qua URL `room.html` trong
  trường hợp quota đầy, hoặc assert toast hiện trước khi có bất kỳ điều
  hướng nào).
- Phần "danh sách phòng trong lobby không load lại sau khi bị đá về" trong
  báo cáo gốc **chưa tái hiện được** trong lần điều tra này (danh sách vẫn
  hiện đúng các phòng cũ). Đừng giả định phần này đã được giải quyết chỉ vì
  sửa xong phần flash — nếu người báo cáo còn gặp lại, cần thêm chi tiết cụ
  thể (ảnh chụp, log console/network lúc đó) trước khi tìm tiếp.

**✅ ĐÃ SỬA (2026-08-02) — xem TODO.md #18.** Hai hướng đã thử, chỉ giữ một:

1. **Hướng ack-trước-khi-điều-hướng (đã làm, sau đó revert)** — đúng gợi ý ở
   trên: `submitCreate()` emit `room:create` từ chính socket của trang lobby,
   chờ `room:joined`/`room:error` rồi mới điều hướng, không còn "flash" sang
   `room.html` nữa trong trường hợp thành công lẫn thất bại. **Nhưng** điều
   hướng trang (lobby → room.html) luôn ngắt socket cũ và trang mới phải mở
   socket mới — trong khoảng ngắt-tới-kết-nối-lại đó, phòng vừa tạo chỉ có
   đúng 1 người (chính người tạo), và `DisconnectHandler.handleDisconnect()`
   coi đây là "phòng rỗng" rồi **huỷ ngay lập tức**. Phải thêm 1 cơ chế grace
   period mới ở server (`emptyRoomGraceTimers`, tách biệt với
   `disconnectTimers` 60s có sẵn cho ván đang chơi) để né việc này. Đo dưới
   tải song song thật (nhiều Playwright worker cùng chạy, mô phỏng máy chậm):
   **grace 5s không đủ**, tăng lên **15s vẫn không đủ** — một số lần điều
   hướng thật sự mất hơn 15 giây dưới tải nặng. Kết luận: đây không phải vấn
   đề "chỉnh số cho đúng" mà là **giới hạn kiến trúc** — bất kỳ grace period
   hữu hạn nào cũng có thể bị phá vỡ bởi mạng/thiết bị đủ chậm, kể cả với
   người dùng thật (không chỉ máy test), và cái giá phải trả khi bị phá vỡ là
   **mất chính phòng người dùng vừa tạo**. Rủi ro này lớn hơn cái lợi của việc
   xoá hẳn flash, nên **đã revert toàn bộ phần server** (không còn
   `emptyRoomGraceTimers`/`cancelEmptyRoomGrace` trong `state.js`/
   `DisconnectHandler.js`/`SocketHandler.js`/`config.js`) và revert
   `submitCreate()`/`processRoomIntent()` về đúng kiến trúc điều hướng lạc
   quan ban đầu.
2. **Hướng giữ điều hướng lạc quan, chỉ sửa hiển thị (đã làm, đang dùng)** —
   không đổi gì ở server hay ở luồng emit `room:create`. Thêm
   `#room-entry-overlay` trong `client/room.html`, hiện **mặc định** (đặt sẵn
   class `visible` trong HTML, không cần JS bật) che toàn bộ khung phòng
   trống/chưa init ngay khi vừa sang `room.html`, đến khi `room:joined` thật
   sự tới thì `room-socket.js`'s `hideEntryOverlay()` mới ẩn đi. Nếu bị từ
   chối, overlay vẫn che nguyên (không ai thấy UI phòng trống/vỡ), toast lỗi
   (`.toast--error`, z-index 1200) hiện đè lên overlay (z-index 1100), rồi
   `room:error` handler đưa về `index.html` sau ~1.5s — đúng pattern đã dùng
   sẵn cho `room:kicked`/`room:destroyed` trong cùng file. Không thêm bất kỳ
   cơ chế server mới nào, không có bề mặt lỗi mới.
3. **Bài học giữ lại**: khi một hướng sửa UX đòi hỏi thêm state/timing mới ở
   server (ở đây là "giữ socket sống qua một lần điều hướng trang"), phải đo
   dưới tải/điều kiện xấu THẬT trước khi tin, không chỉ chạy 1 lần thấy xanh
   là đủ — đúng tinh thần "tái hiện → đo → mới sửa" đã áp dụng cho nhóm
   B19-B26 bên dưới, giờ áp dụng luôn cho cả nhóm B-thường.
4. **Test**: `e2e/leave-then-create-room.spec.ts` cập nhật theo hành vi cuối
   cùng (assert overlay hiện ngay + toast lỗi + bounce về lobby), chạy PASS ổn
   định kể cả dưới `--workers=6` chạy chung với 2 spec nặng khác (đúng điều
   kiện đã làm lộ lỗi của hướng 1). `npm test`: 289/289 xanh — không có test
   unit mới vì #18 cuối cùng không đụng code server.

**⚠️ Vòng 2 (2026-08-02, sau test thật trên `play3cr.dpdns.org`)**: hướng 2 ở
trên hoá ra chỉ che triệu chứng. Người dùng thật báo cáo **không tạo được
phòng nào**, log server xác nhận: mỗi lần tạo phòng, phòng bị huỷ ngay trong
cùng giây do `handleDisconnect()` — không phải hiếm dưới tải nặng như lần đo
trên localhost, mà là **mọi lần**, một mình, mạng thật. Người dùng xác nhận
trực tiếp nguyên nhân: chuyển trang lobby → room bị server xử lý y như một
lần ngắt kết nối thật, và bị lặp lại liên tục.

Sửa lại lần này bằng đúng cơ chế đã revert ở hướng 1 (`emptyRoomGraceTimers`),
nhưng **không** kèm theo phần ack-trước-khi-điều-hướng đã gây rủi ro trước đó:

- `EMPTY_ROOM_GRACE_MS` (`server/config.js`, mặc định 20s, override qua env
  `EMPTY_ROOM_GRACE_MS`). `DisconnectHandler.handleDisconnect()`: nếu người
  vừa ngắt kết nối là **thành viên duy nhất còn lại** trong phòng, không gọi
  `roomManager.leaveRoom()` ngay — gọi `startEmptyRoomGrace()`, giữ nguyên
  membership trong `RoomManager`, chỉ đặt 1 `setTimeout`. Hết giờ mới thật sự
  gọi `leaveRoom()` (qua `finalizeNormalLeave()`, dùng chung logic với đường
  disconnect thường để không lặp code).
- `SocketHandler.js`: mọi kết nối mới đều gọi
  `DisconnectHandler.cancelEmptyRoomGrace(user.userId)` **trước** khi chạy
  logic auto-rejoin sẵn có (`roomManager.getRoomByUser` → emit `room:joined`)
  — không cần đổi gì thêm, vì phòng chưa từng bị xoá khỏi `RoomManager` nên
  auto-rejoin tự nhiên tìm thấy và vào lại được.
- **Vì sao lần này khác lần trước dù cùng ý tưởng "grace period":**
  - Nút "Rời phòng" (`room:leave`, `RoomHandler.js`) hoàn toàn tách biệt khỏi
    `handleDisconnect()` — vẫn huỷ phòng ngay lập tức như cũ. Grace chỉ áp
    dụng cho đường disconnect **ngoài ý muốn** (điều hướng trang, mạng chập
    chờn), không bao giờ trì hoãn một lần rời phòng chủ động.
  - Không đổi `submitCreate()`/kiến trúc điều hướng lạc quan — không thêm
    "chờ ack trước khi chuyển trang" nên không tạo thêm cửa sổ ngắt-kết-nối
    mới nào so với hiện trạng đang chạy.
  - Lo ngại cũ ("bất kỳ timeout hữu hạn nào cũng có thể bị phá vỡ") vẫn đúng
    về lý thuyết, nhưng giờ có bằng chứng thật: **không có grace = hỏng 100%
    số lần**, có grace 20s = một cải thiện chắc chắn so với hiện trạng, không
    phải rủi ro cộng thêm vào một đường đang chạy tốt (vì đường đó *đang
    không* chạy tốt).
- **Test**: `server/tests/DisconnectHandler.test.js`, describe block mới
  "empty-room grace period" — 5 test (bắt đầu grace đúng lúc, cancel qua
  reconnect không gọi `leaveRoom`, hết hạn thì huỷ thật + cleanup timer/ready
  timer + broadcast lobby, disconnect lặp lại không chồng timer, cancel khi
  không có gì đang chờ trả `false`). Mutation-check: revert riêng
  `DisconnectHandler.js` → cả 5 fail → khôi phục → `npm test`: 294/294 xanh.
  Cũng phải sửa mock `DisconnectHandler` trong `SocketHandler.test.js` và
  `flood-protection.test.js` (thêm `cancelEmptyRoomGrace: jest.fn(() =>
  false)`) và mock room trong test "proceeds with normal leave..." (thêm
  `users` map 2 người, vì code mới đọc `room.users.size`).
