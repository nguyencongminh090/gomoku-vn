## #47. Thông báo mất-kết-nối/kết-nối-lại hiện trùng lặp (server chat:message + client tự dịch)

**Nguồn:** phát hiện phụ khi làm follow-up #45 (2026-08-04) — không nằm trong
yêu cầu gốc, ghi riêng theo rule "scope discipline".

**Vấn đề:** Khi một người chơi mất kết nối giữa ván, có **2 cơ chế độc lập**
cùng hiển thị thông báo trong khung chat cho cùng 1 sự kiện:

1. `server/socket/handlers/DisconnectHandler.js` emit `chat:message`
   (`isSystem: true`) với text "X mất kết nối. Chờ kết nối lại (Ns)..."
   (code `PLAYER_DISCONNECTED_GRACE` sau fix follow-up #45).
2. `client/js/room-socket.js`'s `game:interrupted` handler (L381-385) tự gọi
   `ChatUI.appendSystemMessage(t('room.disconnected', {...}))` — cùng nội
   dung, dịch độc lập ở client.

Tương tự với kết nối lại: `DisconnectHandler.js` emit chat message
`PLAYER_RECONNECTED_RESUMED` VÀ client's `game:resumed` handler (L387-389)
tự hiện `t('room.reconnected')`.

Kết quả: người chơi thấy **2 dòng thông báo gần giống nhau** trong chat mỗi
lần có người mất/khôi phục kết nối.

**Đánh giá hiệu quả/an toàn:** không phải bug an toàn, là bug UX (trùng lặp
thông báo) — chưa xác nhận đây là hành vi cũ có từ trước hay mới sinh ra do
đợt fix #45 (không đổi field nào cả 2 phía, nhưng chưa kiểm chứng bằng
browser thật để chắc chắn nó đã trùng từ trước).

**Trạng thái test:** chưa viết.

**Giải pháp đề xuất:** chọn 1 trong 2 cơ chế làm nguồn duy nhất — hoặc bỏ
system `chat:message` phía server cho 2 sự kiện này (để client tự xử qua
`game:interrupted`/`game:resumed`, đã đủ dữ liệu qua `data.playerName`/
`data.secondsLeft`), hoặc bỏ client-side tự dịch và chỉ dựa vào
`chat:message` (nhưng khi đó `game:interrupted`/`game:resumed` mất khả năng
custom UI ngoài chat, cần kiểm tra không phá hành vi khác đang dùng 2 event
này). Cần verify bằng Playwright/browser thật trước khi sửa để xác nhận thực
sự trùng lặp trên UI, không chỉ trên lý thuyết đọc code.
