# #122 — Bỏ `profanity-classifier-model.js` (53 KB) khỏi `room.html` — script chết, chặn parser

**Trạng thái:** ✅ ĐÃ XONG (2026-08-15) — xoá thẻ `<script src="js/profanity-classifier-model.js?v=125">`
khỏi `client/room.html:202`, giữ nguyên `client/js/profanity-classifier-model.js` (file) và
`client/js/profanity-filter.js` không đổi. Bump `?v=125` → `?v=126` toàn bộ `client/*.html` +
`client/js/*.js` (trừ mockup) — `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` ra
đúng 1 giá trị `?v=126`. Xác minh thủ công trên server dev đang chạy (không đụng db thật, không
restart server của người dùng): Playwright vào `room.html` thật, bắt network requests — 0 request
`profanity-classifier-model.js` trong 102 request tổng, 0 console error. Không tự động hoá được
việc gửi chat qua UI (phòng quick-match chờ người chơi thứ 2, overlay chặn click) nên xác minh logic
lọc bậy bằng cách `require()` trực tiếp `client/js/profanity-filter.js` (module CommonJS/UMD không
đổi) và chạy lại các chuỗi thử tiêu biểu (sạch, có dấu, không dấu, leetspeak, cụm dễ dính oan) —
kết quả khớp hành vi cũ, không có Jest cho client HTML nên không có test tự động mới.

**Nguồn:** `gomoku-vn-review-2026-08-14.md` vòng 4, mục 13.5 (đã xác minh lại với code hiện tại
2026-08-15 — xem hội thoại review file này).

## Vấn đề

`client/room.html:202-203` nạp 2 script đồng bộ, chặn parser, theo đúng thứ tự:

```html
<script src="js/profanity-classifier-model.js?v=125"></script>
<script src="js/profanity-filter.js?v=125"></script>
```

`profanity-classifier-model.js` là 53 136 B gốc / 18 971 B nén — nạp lại mỗi lần vào phòng, chặn
HTML parser cho tới khi tải + chạy xong, dù không ảnh hưởng gì tới kết quả lọc bậy.

## Bằng chứng đã đo (review vòng 4, đã đối chiếu code)

`client/js/profanity-filter.js:801-804` tự ghi rõ trong comment: tầng classifier (SVM) **đã bị tắt
theo quyết định sản phẩm** vì gây over-blocking — pipeline lọc hiện tại chỉ dùng exact dictionary
match, không gọi `classifierSaysReal()` nữa (hàm này còn tồn tại trong code nhưng không nằm trên
đường gọi thật).

Review đã verify bằng thực nghiệm: nạp `profanity-filter.js` trong 2 VM context (có model / không
có model) rồi chạy 54 chuỗi thử (tiếng Việt có/không dấu, leet, từ sạch dễ dính oan) —
**0 khác biệt output** giữa 2 bản.

## Đề xuất sửa

Xoá dòng `<script src="js/profanity-classifier-model.js?v=125"></script>` khỏi `client/room.html`.
Không đụng `profanity-filter.js` hay `profanity-classifier-model.js` (file JS) — chỉ bỏ thẻ nạp nó.

Bump `?v=125` → `?v=126` theo quy tắc cache-busting trong `CLAUDE.md` (đụng
`client/room.html`, không đụng `client/css/`/`client/js/*.js` nội dung — nhưng file HTML đổi nên
vẫn cần bump để đồng bộ, xem quy tắc: mọi `<link>`/`<script>` trong `client/*.html` phải cùng 1
`?v=N`).

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả:** -18 971 B chặn parser mỗi lần vào phòng, -53 KB CPU parse trên máy yếu (giá trị rõ
  nhất trên mobile/máy yếu, không phải trên desktop/wifi tốt — xem 13.9 của review).
- **Rủi ro:** gần như 0 — đã có bằng chứng thực nghiệm output không đổi.
- **Test:** không có Jest runner cho việc "trang HTML nạp script nào" (client-side, không có test
  infra cho việc này — nói thẳng theo CLAUDE.md, không bỏ qua âm thầm). Xác minh thủ công: mở
  DevTools Network trên `room.html` sau khi sửa, xác nhận không còn request
  `profanity-classifier-model.js`, và chat vẫn lọc đúng các chuỗi thử đã có trong review.
- **Nếu sau này bật lại classifier:** nạp lười (`import()` lúc mở khung chat), không dùng
  `<script>` đồng bộ — ghi chú lại trong review, không phải việc của mục này.

Chi tiết thực thi: [docs/instruction/B122-bo-profanity-classifier-model-khoi-room-html.md](../instruction/B122-bo-profanity-classifier-model-khoi-room-html.md).
