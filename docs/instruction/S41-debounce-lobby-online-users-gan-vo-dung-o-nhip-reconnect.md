# §41. Debounce `lobby:online_users` gần vô dụng ở nhịp reconnect thật (review 12.5, TODO.md #41)

## §41 — Debounce `lobby:online_users` gần vô dụng ở nhịp reconnect thật (review 12.5, TODO.md #41)

**Đừng nhầm với TODO #29** — debounce hiện có (`ONLINE_USERS_DEBOUNCE_MS =
300`, `server/socket/state.js`) được thêm để giảm chi phí O(n²) lúc **burst**
6000 người connect đồng thời, dùng đúng pattern `broadcastLobbyUpdate()`
(per-`io` WeakMap timer). Đó là một vấn đề khác — chi phí CPU lúc burst — với
vấn đề review 12.5 nêu: **hiệu quả giảm gói tin** ở nhịp reconnect rải rác
thật (mỗi lần cách nhau 150-400ms do backoff của client, không phải burst).
Cả hai đều đúng, không loại trừ nhau — sửa #41 không được làm hồi quy #29.

**Hướng sửa rẻ (khuyến nghị làm trước):** nâng `ONLINE_USERS_DEBOUNCE_MS` lên
1-2s — cùng bài học đã áp dụng cho `lobby:update` debounce (TODO #9, cửa sổ
300ms không khớp nhịp người thật ~1200ms). Không giảm được payload, chỉ giảm
số gói.

**Hướng sửa thật (xa hơn, không bắt buộc trong lần này):** chuyển
`lobby:online_users` sang delta `{added, removed}` giống `lobby:patch` (TODO
#9) và `room:updated` delta (TODO #8 phần mở rộng) — khi đó cửa sổ debounce
bao nhiêu không còn quan trọng vì gói không đổi thì không gửi.

**Test:** mô phỏng đúng backoff 1000-5000ms của `client/js/socket-client.js`
(không phải burst đồng loạt) trong test debounce, assert số gói giảm đáng kể
so với baseline không debounce — bài test cũ (nếu có) chỉ assert case burst
thì không đủ để coi mục này đã được bảo vệ.

---
