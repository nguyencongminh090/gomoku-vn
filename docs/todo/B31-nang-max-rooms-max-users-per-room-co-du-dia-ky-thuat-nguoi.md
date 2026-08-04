# Phần B #31. Nâng `MAX_ROOMS`/`MAX_USERS_PER_ROOM` — có dư địa kỹ thuật, người dùng

**Nguồn:** yêu cầu người dùng, dựa trên số liệu stress test (2026-08-03)


31. ~~**Nâng `MAX_ROOMS`/`MAX_USERS_PER_ROOM` — có dư địa kỹ thuật, người dùng
    quyết định con số**~~
    **✅ ĐÃ SỬA (2026-08-03)** — người dùng hỏi thẳng "test result cho thấy có
    thể tăng số user, có nâng không?" sau khi tôi chỉ ra `docs/stress-test-
    report.md` §8 đã ghi rõ: cap 200 room-members (`MAX_ROOMS=10 ×
    MAX_USERS_PER_ROOM=20`) là quyết định **chống spam/abuse**, không phải
    giới hạn hiệu năng — server đã đo sạch tới ~3000-4000 người đồng thời.
    Người dùng chốt số: `MAX_ROOMS=50`, `MAX_USERS_PER_ROOM=40` (2000
    room-members tối đa, vẫn có margin rộng dưới ngưỡng ~3000-4000).
    - **Sửa:** đổi default trong `server/config.js` (10→50, 20→40).
      **Cố ý không đổi `MAX_ROOMS_PER_IP` (giữ 3)** — người dùng không yêu
      cầu, và pool càng lớn thì cap 3/IP càng có ý nghĩa hơn về mặt chống
      abuse (3/50 = 6% so với 3/10 = 30% trước đây), không phải nới lỏng.
      Đã nêu rõ điểm này với người dùng trước khi sửa, không tự ý đổi thay.
      Sửa luôn comment lỗi thời ở `RoomManager.js` ("MAX_ROOMS is 10") và cập
      nhật bảng biến môi trường trong `README.md` +
      `scripts/capacity-test/README.md` (đang mô tả default cũ).
    - **Test:** file mới `server/tests/room-capacity-config.test.js` (8 case,
      cùng pattern với `listen-backlog.test.js` — pin đúng giá trị mặc định
      mới 50/40, override qua env, fallback khi input không phải số, và xác
      nhận `MAX_ROOMS_PER_IP` vẫn là 3/vẫn là tỷ lệ nhỏ so với `MAX_ROOMS`
      mới). Thêm describe block mới trong `RoomManager.test.js` (3 case) —
      trước đây **chưa có test nào** phủ riêng cap `MAX_ROOMS` (chỉ có
      `MAX_ROOMS_PER_IP`) dù đây là dòng code đầu tiên chạy trong
      `createRoom()`: tạo đủ `MAX_ROOMS` phòng trải trên nhiều IP khác nhau
      (né `MAX_ROOMS_PER_IP`), xác nhận phòng thứ N+1 (từ IP hoàn toàn mới)
      vẫn bị từ chối, và huỷ 1 phòng thì nhả đúng 1 chỗ trống.
      Mutation-check: revert `config.js` → đúng 5/8 test ở file mới đỏ (các
      test kiểm literal 50/40), phần còn lại xanh vì dùng so sánh tương đối
      — xác nhận test bắt đúng giá trị cụ thể chứ không phải chỉ hành vi
      chung chung. `npm test`: 324/324 xanh (+11 case).
    - **Đã kiểm bằng server thật + socket thật** (không chỉ unit test
      RoomManager): tạo 1 phòng, cho 40 guest thật (JWT tự ký, cùng bypass
      dùng trong `scripts/capacity-test/`) lần lượt join → đúng **39** vào
      được (host + 39 = 40 = cap), người thứ 40 bị từ chối sạch bằng
      `"Phòng đã đầy."`, khớp chính xác dự đoán.
    - **Không thuộc phạm vi việc này** (không tự ý đổi): `MAX_ROOMS_PER_IP`.
      Nếu sau này muốn nới thêm `MAX_ROOMS`, nên xem lại tỷ lệ này cùng lúc.
