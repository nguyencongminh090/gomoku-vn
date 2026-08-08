# Phần B #70. Style nút bấm (button) không nhất quán trên toàn `client/`

**Nguồn:** yêu cầu người dùng — "Check all button style, I found some button has inappropriate
style, not uniform with UI" (2026-08-08). Xác nhận qua audit đọc toàn bộ `client/css/*.css` +
`client/*.html`.

## Vấn đề đã xác nhận

Không có 1 file `.btn` base dùng chung cho toàn app — `login.css` tự định nghĩa `.btn` riêng,
`lobby.css`/`room.css`/`game.css`/`history.css`/`tournament.css` mỗi file tự có class nút riêng, một
số dùng token trong `main.css` (`--c-brand`, `--radius`, `--shadow-sm`...), một số hardcode màu/shadow
thẳng. Audit tìm thấy các điểm lệch cụ thể sau, xếp theo mức dễ nhận thấy với người dùng:

1. **Màu xanh lá cũ (`#48875f`/`#2c7a4b`/`#3a7050`) còn sót lại** trong khi brand hiện tại là indigo
   (`--c-brand #4F46E5`): `.room--focus > #chat-input-wrapper button`
   ([room.css:574](../../client/css/room.css#L574)), `.btn-focus`
   ([game.css:593,605](../../client/css/game.css#L593)), `.btn-draw-accept`
   ([game.css:313-320](../../client/css/game.css#L313-L320)), `.swap2-choice .btn-game`
   ([game.css:259-266](../../client/css/game.css#L259-L266)).
2. **`--c-danger` không hề được định nghĩa trong `:root`** — mọi chỗ dùng nó
   (`.organizer-tools .btn-secondary--danger` ở [tournament.css:129](../../client/css/tournament.css#L129),
   nút huỷ trong `tournament.html:168,189`) đều rơi về fallback hardcode `#dc2626`, không đổi theo
   dark mode — trong khi `--c-error`/`--c-error-bg` (token thật, có bản dark) đã tồn tại và được
   `.btn-slot--stand` dùng đúng. Hai màu đỏ khác nhau cho cùng ý nghĩa "nguy hiểm/lỗi".
3. **Nút gửi chat ở focus-mode khác nút gửi chat thường** dù cùng 1 tính năng: bản thường
   ([room.css:615-635](../../client/css/room.css#L615-L635)) dùng `border-radius: var(--radius)`
   (12px) + `var(--c-brand)`; bản focus-mode
   ([room.css:573-581](../../client/css/room.css#L573-L581)) dùng `14px` (không thuộc scale nào) +
   fallback xanh lá cũ.
4. **`.btn-kick`** ([room.css:654-673](../../client/css/room.css#L654-L673)) lệch hẳn khỏi
   `.btn-slot` cùng panel: `border-radius: 4px` + border/hover hardcode hồng (`#F0C9C4`/`#FBE0DD`)
   thay vì `var(--radius)` + `var(--c-error)`/`var(--c-error-bg)`. Có thêm khai báo `padding` lặp
   (dòng 655 bị dòng 656 đè — dead code, không chủ ý).
5. **`.draw-prompt`** ([game.css:271-329](../../client/css/game.css#L271-L329)) dùng hẳn 1 bảng màu
   hardcode riêng (`#fef3cd`/`#ffc107`/`#856404`/`#48875f`/`#c0392b`), không trace về token nào.
6. **Box-shadow hardcode** không theo dark mode: `.btn-primary` (login.css:384-387), `.btn-focus`
   (game.css) , `.btn-game--resign:hover` (game.css) — trong khi phần lớn nút dùng
   `var(--shadow-sm)`/`var(--shadow)` (đã có bản dark trong `main.css`).
7. **Bug nhỏ: rule `:active` cục bộ bị `!important` toàn cục đè chết.** `main.css:447-452` áp
   `transform: scale(0.97) !important` cho mọi `button:active`/`.btn:active`. Nhiều component tự định
   nghĩa `:active { transform: translateY(0) scale(0.96) }` riêng (`.btn-create` lobby.css:100,
   `.modal__actions .btn-confirm/.btn-cancel` lobby.css:628/639) trên `<button>` thật — rule này
   không bao giờ chạy được vì thiếu `!important`, khiến phản hồi khi nhấn không nhất quán giữa
   `<button>` và `<a>` cùng class.
8. Phụ (độ ưu tiên thấp, cosmetic): 3 tier `border-radius` không thống nhất hoàn toàn (pill 9999px /
   card 12px / micro 4px, với vài outlier như `14px`/`8px` không thuộc tier nào), disabled-state xử
   lý khác nhau theo file (`opacity` vs đổi màu nền, `cursor` khác nhau), font-weight nút "chính"
   dao động 600/700/800 không rõ lý do.

## Việc cần làm

- Ưu tiên xử lý theo thứ tự 1 → 7 ở trên (visual impact giảm dần); mục 8 làm sau cùng nếu còn thời
  gian.
- Định nghĩa `--c-danger`/`--c-danger-bg` thật trong `:root` (kèm bản dark) HOẶC thay hết
  `var(--c-danger, ...)` bằng `var(--c-error, ...)` đã có sẵn — chọn 1, không giữ cả 2 song song.
- Đồng bộ nút gửi chat focus-mode với bản thường (mục 3) và dọn `.btn-kick` (mục 4) theo đúng token
  đã dùng ở component liền kề.
- Thay toàn bộ hex xanh lá cũ + `.draw-prompt` bằng token tương ứng (`--c-brand`, `--c-warning*` nếu
  cần thêm, `--c-error*`).
- Sửa duplicate `padding` ở `.btn-kick` (room.css:655-656) — xoá dòng thừa.
- Cân nhắc thêm `!important` (hoặc gộp giá trị active vào rule toàn cục) cho mục 7 — không tự ý đổi
  giá trị scale nếu chưa xác nhận giá trị nào là "đúng" theo thiết kế.
- Bump `?v=N` theo `CLAUDE.md` vì đổi nhiều file trong `client/css/`.
- Đây là CSS-only, không đổi HTML structure hay logic JS — rủi ro thấp nhưng chạm nhiều file, nên
  test kỹ bằng mắt (cả light/dark mode) trước khi merge, không chỉ dựa vào việc CSS parse được.

## Trạng thái

✅ ĐÃ XONG (2026-08-08, branch `fix/button-style-inconsistency` trên `dev`).

**Quyết định đã xác nhận với người dùng trước khi làm** (qua AskUserQuestion):
- `--c-danger` → gộp về `--c-error`/`--c-error-bg` đã có sẵn (không định nghĩa `--c-danger` mới).
- `.btn-kick` màu hồng hardcode → coi là không chủ ý, đổi sang `--c-error`/`--c-error-bg`.
- Bug `:active` (mục 7) → thêm `!important` vào rule cục bộ từng component (không sửa rule toàn cục).

**Đã làm theo đúng thứ tự ưu tiên 1 → 7:**
1. Xoá hết hex xanh lá cũ (`#48875f`/`#2c7a4b`/`#3a7050`) trong `game.css`
   (`.game-info__turn--mine`, `.swap2-choice .btn-game`, `.btn-focus`,
   `.room--focus #chat-input-wrapper button`) → dùng `var(--c-brand)`/`var(--c-brand-dark)`.
2. Gộp `--c-danger`/`--c-danger-bg` → `--c-error`/`--c-error-bg` trong `tournament.css`, `lobby.css`,
   `tournament.html` (giữ nguyên `tournament-detail-mockup.html` — file đông lạnh theo quy tắc
   cache-busting).
3. Đồng bộ nút gửi chat focus-mode (`game.css`) với bản thường (`room.css`): cùng
   `border-radius: var(--radius)`, `var(--c-brand)`, hover/active transition giống hệt.
4. `.btn-kick` (`room.css`): border/hover đổi từ hồng hardcode sang `var(--c-error)`, border-radius
   `4px` → `var(--radius)`, xoá dòng `padding` trùng lặp (dead code).
5. `.draw-prompt` + `.btn-draw-accept`/`.btn-draw-decline` (`game.css`): đổi bảng màu hardcode riêng
   sang `var(--c-warning)`/`var(--c-warning-bg)`/`var(--c-ink)`/`var(--c-success)`/`var(--c-error)`.
6. Box-shadow hardcode → `var(--shadow-sm)`/`var(--shadow)`: `.btn-primary` (login.css),
   `.btn-focus` (game.css), `.btn-game--resign:hover` (game.css).
7. Thêm `!important` vào ~13 rule `:active` cục bộ trên `<button>`/`.btn` bị rule toàn cục
   `button:not(:disabled):active { transform: scale(0.97) !important; }` (main.css:449) đè chết —
   `.password-toggle`, `.btn` (login.css), `.btn-game`, `.room--focus #chat-input-wrapper button`,
   `.btn-focus` (game.css), `.btn-create`, `.btn-secondary`, `.btn-join`, `.modal__close`,
   `.modal__actions .btn-confirm` (lobby.css), `.btn-slot`, `.chat-input button`, `.btn-kick`
   (room.css).
8. Cosmetic (border-radius/disabled-state/font-weight tiers): **bỏ qua** — mục ưu tiên thấp nhất
   theo chính tài liệu này ("làm sau cùng nếu còn thời gian"), không làm trong lượt này.

**Phát sinh ngoài phạm vi, tách ra #71:** lúc verify bằng Playwright thật (không chỉ đọc code),
phát hiện `.room--focus > #chat-input-wrapper` dùng combinator con trực tiếp (`>`) trong khi
`#chat-input-wrapper` lồng sâu hơn — sửa combinator đó (CSS-only, đã xác nhận với người dùng) nhưng
verify tiếp thì lộ ra bug sâu hơn: `.room--focus .panel-right-shell { display: none !important; }`
ẩn cả tổ tiên chứa `#chat-input-wrapper`, mà `position:fixed` không thoát được tổ tiên `display:none`
— toàn bộ ô chat focus-mode không vẽ ra được dù CSS đúng. Bug này cần đổi HTML/JS (ngoài phạm vi
CSS-only của #70) → tách thành `TODO.md #71`, không sửa trong lượt này.

**Verify:** chạy server thật với DB tạm (theo quy tắc Playwright/e2e trong `CLAUDE.md`), Playwright
guest-login → tạo phòng → chụp màn hình `login.html`, `index.html` (+ modal tạo phòng), `room.html`
(+ tab Khán giả với `.btn-kick`), cả light lẫn dark mode. Không có console error. Xác nhận màu
brand indigo, `--c-error` áp đúng theo theme; `.btn-kick` chuyển từ hồng sang đỏ chuẩn. Không chạy
được `npm test` liên quan vì đây là CSS-only, `client/` không có test runner tự động (theo đúng ghi
chú "Bug-fix workflow" trong `CLAUDE.md`).
