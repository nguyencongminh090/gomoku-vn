# B139 — Nút "Bắt đầu" bị bottom sheet che trên mobile

## Ràng buộc

- **Giữ `pointer-events: none` trên `.start-modal`** và `auto` trên `.start-modal__card` (§B36) —
  đó là cơ chế cho phép đứng dậy khỏi ghế / chat trong lúc modal hiện. Sửa `z-index` chứ đừng đổi
  mô hình click.
- Thang `z-index` mobile hiện có, có comment trong `room-zen.css:944-951`: sheet **700** > quick chat
  bar **650** > float messages **550**. Nếu nâng `.start-modal`, phải nâng lên **trên 700** và ghi
  chú vào đúng chỗ comment đó, nếu không lần sau lại có người chỉnh sheet và phá tiếp.
- **Không** dùng phương án "modal hiện thì tự thêm `zen-drawer-collapsed`": nó tạo thêm nguồn sự
  thật thứ tư cho class đang là tâm điểm của #134/#136, và sẽ nuốt mất lựa chọn thủ công của người
  dùng khi modal tắt.

## Verify (bắt buộc)

Dùng `page.click('#start-modal-btn')` — **chạm thật**, để Playwright kiểm tra actionability. Gọi
`el.click()` qua `evaluate` sẽ pass giả vì nó bỏ qua hit-testing (chính script tái hiện đã phải làm
vậy để đi tiếp, đừng nhầm đó là bằng chứng đã sửa). Ma trận tối thiểu: Pixel 5 (393×727), một profile
điện thoại rộng hơn, một tablet ~820px, và một desktop để chắc chắn không đổi hành vi hiện tại.
Kiểm tra kèm: sheet vẫn phủ `.quick-chat-bar`/`.float-messages`, và modal không chặn nút thu sheet.

`?v=N` bump theo quy tắc `CLAUDE.md` vì đụng `client/css/`.
