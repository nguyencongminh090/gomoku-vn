# Fix log entry — 2026-08-22 21:39

## Prompt

Người dùng: "do #150" (mục vừa được tách ra từ điều tra #147 ở lượt trước).

## Action

`docs/instruction/B150-*.md` — do chính tôi viết ở lượt trước — mở đầu bằng "Hỏi trước khi làm: cái
này có đáng làm không?", và đánh dấu câu hỏi ai-được-nhận-buffer là quyết định sản phẩm/quyền riêng
tư phải chốt với người dùng. Nên thứ tự: điều tra phần kỹ thuật trước (không cần hỏi gì), rồi đưa
đúng một câu hỏi với phạm vi thật trong tay.

Điều tra tìm ra 3 thứ, trong đó 2 thứ làm thay đổi hẳn thiết kế so với mô tả ban đầu của mục:

1. **`chat:message` là kênh dùng chung.** Không chỉ chat người chơi — grep ra ~30 chỗ emit thông báo
   hệ thống (`GameHandler` 18, `RoomHandler` 4, `DisconnectHandler` 4, `state.js` 2, `LobbyHandler` 1,
   `TournamentMatchHandler` 7). May là có discriminator sạch: `isSystem: true` + `code` + `vars` +
   `from: null`, còn chat thật (`managers/ChatHandler.js:126`) có `from`/`fromId` và không có
   `isSystem`. Buffer "tất cả `chat:message`" sẽ sai — phát lại "X đã mất kết nối" cho chính X sau
   khi X kết nối lại là vô nghĩa, và những thông báo đó mô tả state mà `room:joined` đã dựng lại rồi.

2. **Chat phòng giải đấu là cơ chế riêng.** Instruction bắt grep chứ đừng giả định — kết quả:
   `tmatch:chat_message`, bản cài đặt tự chứa ở `tournament-match.js:791`, `tournament-match.html:122`
   ghi rõ "its own parallel mechanism". Phạm vi hẹp hơn đã lo, không phải gấp đôi.

3. **`chat-ui.js:77-81` bắn float toast cho mọi tin không phải hệ thống** (cố ý: "always, not just
   mid-game"). Nạp buffer N tin qua `appendChatMessage()` = N toast nổi bắn ra cùng lúc lúc vào phòng.

Đưa câu hỏi phạm vi cho người dùng qua `AskUserQuestion`: chỉ-người-quay-lại (khuyến nghị) vs
mọi-người-vào-phòng, kèm cảnh báo khán giả cũng đọc được ở phương án 2.

## Decision

Người dùng trả lời: **"có vẻ không đáng làm"** ⇒ **đóng #150, không làm**.

Đây đúng là kết quả mà instruction của chính mục này dự liệu: không ai báo cáo triệu chứng (mục do
tôi tìm thấy khi điều tra #147, không đến từ người dùng thật), và "một tính năng không ai thiếu là
chi phí bảo trì thuần tuý". Việc hỏi trước khi code đã tiết kiệm đúng phần code không nên viết.

**Giữ lại toàn bộ phần điều tra** trong `docs/todo/B150-*.md` thay vì xoá mục đi. Ba dữ kiện trên
không phụ thuộc vào việc có làm buffer hay không — chúng là mô tả kiến trúc chat hiện tại, và bất kỳ
ai đụng vào `chat:message` sau này đều cần, nhất là dữ kiện (1): rất dễ tưởng đó là kênh chat thuần.

## Summary output

Không có thay đổi code nào — `git diff --stat -- server/ client/` rỗng. Không chạy lại `npm test` vì
không có file runtime nào bị đổi (lần chạy gần nhất, lượt #145: 1245/1245).

`docs/todo/B150-*.md` cập nhật ✅ Đã đóng + thêm mục "Điều tra 2026-08-22" (3 dữ kiện, có đường dẫn
file:dòng cụ thể để kiểm chứng lại). `TODO.md` #150 → ✅ kèm tóm tắt 3 dữ kiện ngay trên dòng index.
`docs/instruction/B150-*.md` giữ nguyên — hướng dẫn thực thi vẫn đúng nếu mục này được mở lại.

Commit thẳng trên `dev` — tracking-doc-only.
