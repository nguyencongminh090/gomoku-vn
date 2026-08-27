# B147 — Bật `connectionStateRecovery`

## Dừng và hỏi người dùng trước khi viết code

Đây **không** phải "bật một cờ cấu hình". Nó thay đổi đường đi của reconnect, tức là đi thẳng qua ba
vùng code đã có lịch sử sinh bug: single-device eviction, ba loại grace period, và cờ
`auth.reconnect`. Chốt phạm vi + `maxDisconnectionDuration` với người dùng trước.

## Vùng nguy hiểm 1 — `auth.reconnect` và "đăng nhập ở thiết bị khác" giả

`SocketHandler.js` `io.on('connection')`: nếu `sessions.get(userId)` còn socket cũ thì evict, và
**chỉ bỏ qua `session:kicked` khi `socket.handshake.auth.reconnect === true`**. Cờ đó do
`socket-client.js` đặt trong listener `reconnect_attempt` của **Manager**.

Đây chính xác là cơ chế đã sinh ra triệu chứng giả "Tài khoản của bạn vừa đăng nhập ở một thiết bị
khác" — có comment dài giải thích tại chỗ, và `docs/todo/B131-*.md` có hẳn một mục "Điểm cần theo
dõi" về cửa sổ chồng lấn giữa socket cũ chưa chết và socket mới.

Trước khi bật recovery, **phải trả lời được**: khi socket.io phục hồi một session,
`handshake.auth.reconnect` có còn được đặt không? `sessions` map có bị bỏ qua không? Truy bằng cách
đọc code socket.io thật trong `node_modules` + dựng thử, **không** suy từ tài liệu.

Nếu câu trả lời là "cờ không được đặt trên đường recovery" ⇒ mọi lần rớt mạng sẽ đá người chơi về
trang login. Đó là hồi quy nghiêm trọng hơn hẳn lợi ích mục này mang lại.

## Vùng nguy hiểm 2 — `skipMiddlewares`

`skipMiddlewares: true` bỏ qua **toàn bộ** `io.use(...)`, tức là cả `verifySocketToken` **lẫn**
middleware chống flood. Hệ quả:

- Session đã bị **thu hồi** (logout, kick) trong lúc rớt sẽ **sống lại** qua recovery. Điều này phá
  đúng cái mà #68 xây dựng: "chỉ server mới kết thúc được session". Không chấp nhận được.
- Bộ đếm chống flood không được dựng lại cho socket phục hồi.

⇒ **Mặc định để `skipMiddlewares: false`.** Nếu bench chứng minh middleware là chi phí đáng kể thì
xử lý bằng #146 (làm middleware rẻ đi), không phải bằng cách bỏ qua nó.

## Vùng nguy hiểm 3 — ba loại grace period

`DisconnectHandler` có `cancelDisconnectGrace` / `cancelEmptyRoomGrace` / `cancelSpectatorGrace`, và
#115 vừa mới chỉnh nhánh Viewer (không giới hạn thời gian) tách khỏi seated-player (30 s). Recovery
có thể **chồng lấn** hoặc **vô hiệu hoá** chúng — hai cơ chế cùng giải quyết "người chơi quay lại
sau khi rớt", đặt cạnh nhau mà không truy thì sẽ mâu thuẫn.

`maxDisconnectionDuration` phải được chọn **có ý thức so với** các hằng grace hiện có, không phải
copy con số 2 phút từ tài liệu. Đối chiếu với `SPECTATOR_GRACE_MS` và các hằng liên quan trong
`server/config.js` trước khi chốt.

Tuyệt đối **không** `Infinity` — tài liệu socket.io nói thẳng, và Discord cũng huỷ session sau ~5
phút. Một session phục hồi vô hạn là rò rỉ bộ nhớ có bề mặt tấn công.

## Bài học mượn từ Discord: phải leo thang được

Discord bắt client **leo thang từ RESUME sang IDENTIFY** sau nhiều lần thất bại, thay vì kẹt trong
vòng lặp resume vô hạn — đây là lỗi đã được ghi nhận trong thực tế. Kiểm rằng đường "phục hồi thất
bại ⇒ kết nối mới hoàn toàn" thực sự chạy được, và test nó. Đừng chỉ test đường thành công.

## Đừng đụng

- **`timeout: 12000` và mọi tham số `reconnection*`** — hiệu chỉnh bằng số đo thật ở #131, ngoài
  phạm vi mục này.
- **`revokeOtherSessionsForUser`** và thứ tự "thu hồi TRƯỚC khi disconnect" — đó là #68, có lý do
  bảo mật, không phải chi tiết triển khai tuỳ tiện.

## Test (bắt buộc) — phải phủ **cả hai** kịch bản dễ lẫn vào nhau

1. Cùng một tab rớt transport rồi phục hồi ⇒ **không** có `session:kicked`, room cũ còn nguyên,
   event bị lỡ được phát lại.
2. Thiết bị thứ hai đăng nhập thật ⇒ **vẫn** kick được thiết bị cũ, và session cũ **vẫn** bị thu hồi
   ở DB (không sống lại qua recovery).
3. Session bị thu hồi trong lúc đang rớt ⇒ phục hồi **phải** thất bại.
4. Quá `maxDisconnectionDuration` ⇒ rơi về kết nối mới hoàn toàn, không kẹt.

Kịch bản 2 và 3 là guard hồi quy cho đúng bug mà mục này có nguy cơ tái tạo — đừng bỏ.

Ngoài Jest, mục này chạm hành vi người dùng thật ⇒ theo checklist "Feature completion" của
`CLAUDE.md`, kiểm chứng bằng trình duyệt thật trên **instance cô lập** (copy repo + DB tạm + cổng
riêng, `playwright-e2e-safety`), mô phỏng rớt mạng thật chứ không chỉ gọi `socket.disconnect()`.
