# B73. Nút `.btn.btn-confirm` không có base style ngoài modal (TODO.md #73)

**Nguồn:** báo cáo người dùng kèm ảnh chụp, TODO.md #73.

## Cách tiếp cận

- Root cause đã xác định rõ (xem [docs/todo/B73](../todo/B73-nut-btn-btn-confirm-khong-co-base-style-ngoai-modal.md)):
  `.btn`/`.btn-confirm` chưa từng có rule unscoped áp dụng được trên trang giải đấu — chỉ có
  `.modal__actions .btn-confirm` (scoped) và vài rule chỉ set kích thước. Không cần điều tra lại từ
  đầu, đi thẳng vào thêm base rule.
- **Thêm, không di chuyển.** Giữ nguyên `.modal__actions .btn-confirm` — đừng đổi nó thành base rồi
  xoá; base mới nên tách biệt rồi để `.modal__actions .btn`/`.btn-confirm` tiếp tục override
  padding/font-size lớn hơn cho ngữ cảnh modal (như code hiện tại đang làm cho `.pairing-card__actions
  .btn`).
- Đặt rule base ở `tournament.css` hay `lobby.css`: ưu tiên `tournament.css` nếu chỉ trang giải đấu
  cần, nhưng kiểm tra lại — `index.html` (tournaments.js card) cũng dùng, và `index.html` không load
  `tournament.css`. Kiểm tra `<link>` từng trang trước khi chọn file, đừng giả định.
- Dùng token màu/shadow đã có (`--c-brand`, `--c-brand-dark`, `--shadow-sm`) — không hardcode hex mới,
  giữ nhất quán với những gì #70 vừa dọn.
- Base rule áp dụng cho cả `<button>` và `<a>` cùng class (xem `tournament-match.html:162` dùng `<a
  class="btn btn-confirm">`) — không viết selector giới hạn chỉ `button.btn-confirm`.
- Vì đổi CSS, nhớ bump `?v=N` theo `CLAUDE.md` rồi chạy lại grep verify.
- Verify bằng browser thật, đúng 4 vị trí trong ảnh báo cáo gốc (danh sách giải đấu, banner chi tiết,
  pairing card, modal kết quả trận) — không chỉ đọc CSS parse được là coi xong, theo "Feature
  completion checklist" trong `CLAUDE.md`.
- Đây là bug CSS-only tiếp theo #70 — theo "Git workflow" trong `CLAUDE.md`, dùng nhánh
  `fix/<slug>` riêng, 1 commit, verify xong mới merge. Base branch: kiểm tra `TODO.md`/`docs/todo/B73`
  đã tồn tại trên `main` hay chỉ trên `dev` trước khi chọn base (theo quy tắc exception trong CLAUDE.md
  "fix whose tracking entry only exists on dev").
