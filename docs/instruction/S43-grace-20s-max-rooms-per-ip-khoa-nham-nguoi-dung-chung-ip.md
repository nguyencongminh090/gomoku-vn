# §43. Grace 20s + `MAX_ROOMS_PER_IP` khoá nhầm người dùng chung IP (review 12.5, TODO.md #43)

## §43 — Grace 20s + `MAX_ROOMS_PER_IP` khoá nhầm người dùng chung IP (review 12.5, TODO.md #43)

**Bản chất vấn đề:** `MAX_ROOMS_PER_IP` (TODO #7, `RoomManager.js`) đếm quota
bằng cách **quét `this.rooms`** tại thời điểm tạo phòng (cố ý chọn cách này
để không có đường decrement nào bị quên — xem `docs/fix-log.md` 2026-08-02
02:37). Grace period 20s (TODO #18 vòng 2) giữ phòng **sống trong map** thêm
20s sau khi người cuối cùng rời/rớt mạng, để họ reconnect được. Hai cơ chế
này cộng lại nghĩa là: phòng bỏ hoang vẫn đếm vào quota của IP tạo ra nó
trong suốt 20s, dù không còn ai trong đó.

**Ràng buộc quan trọng — không được phá vỡ khi sửa:** đừng quay lại kiểu bộ
đếm tăng/giảm riêng cho quota (tally) — đúng lý do `MAX_ROOMS_PER_IP` chọn
cách quét-trực-tiếp thay vì tally là để tránh lớp bug "quên decrement ở 1
trong N đường teardown". Nếu tách "phòng còn sống" khỏi "phòng tính vào
quota", **vẫn phải đếm bằng cách quét** — ví dụ quét `this.rooms` nhưng bỏ
qua phòng đang trong `emptyRoomGraceTimers` (đang chờ xoá, không còn ai)
thay vì cộng thêm 1 map đếm riêng.

**Rủi ro cần tránh khi sửa:** nếu nhả quota ngay lúc bắt đầu grace (thay vì
lúc phòng thực sự bị xoá), một client có thể lách `MAX_ROOMS_PER_IP` bằng
cách tạo phòng → rời ngay lập tức (kích hoạt grace) → tạo phòng mới — lặp lại
liên tục để giữ nhiều hơn 3 phòng "gần sống" cùng lúc. Đây chính xác là kiểu
tấn công `MAX_ROOMS_PER_IP` được thêm vào để chặn (review 3.2). Cần đảm bảo:
phòng đang trong empty-room-grace vẫn tính vào quota của IP đó cho tới khi
**hoặc** grace hết hạn thật (phòng bị xoá) **hoặc** đủ lâu để coi là bỏ hoang
thật — không nhả ngay lập tức chỉ vì "đang chờ".

**Hướng khả dĩ, cần hỏi người dùng chọn trước khi sửa:** (a) giữ nguyên hành
vi hiện tại, chỉ rút ngắn `EMPTY_ROOM_GRACE_MS` cho case đây (đánh đổi ít hơn
thời gian phục hồi phòng); (b) tách 1 quota riêng nhỏ hơn cho phòng "đang
grace" (vd. không tính phòng-đang-grace vào `MAX_ROOMS_PER_IP` cứng nhưng
vẫn có 1 giới hạn phụ để chặn lách quota); (c) chấp nhận đây là rủi ro thấp
(người dùng chung IP hợp lệ hiếm khi đụng đúng lúc 3 phòng cùng trong grace)
và không sửa. **Không tự chọn (b) chỉ vì nó "đúng nhất về mặt kỹ thuật"** —
đây là đánh đổi UX-vs-an-toàn-chống-abuse mà reviewer để ngỏ, cần người dùng
quyết định trước khi code.

**Test dự kiến (khi đã chọn hướng):** case trong `RoomManager.test.js` dựng
đúng kịch bản — 3 phòng cùng IP, 1 phòng vào grace (chủ rời), assert quota
theo đúng hướng đã chọn (nhả ngay hay giữ), và **thêm 1 case chống lách quota**
xác nhận việc lặp lại tạo-rồi-rời không cho phép vượt quá giới hạn thật.

---
