# #110 — `i18n.js` (73 KB) ship cả từ điển `vi` lẫn `en` dù mỗi phiên chỉ dùng một

**Trạng thái:** ✅ Đã đóng, không sửa (2026-08-12) — người dùng chốt sau khi có số đo thật

Cùng cách xử lý như #63: đo trước, rồi đóng vì **lợi ích không đáng rủi ro**, chứ không phải vì
khó làm.

**Số đo thật** (brotli, đo bằng cách tách đúng 2 khối từ điển trong `client/js/i18n.js`):

| | raw | gzip -9 | brotli |
|---|---|---|---|
| cả file (hiện tại) | 73 467 B | 18 055 B | **14 225 B** |
| chỉ `vi` | 35 751 B | 8 784 B | 7 930 B |
| chỉ `en` | 32 154 B | 8 070 B | 7 010 B |
| phần runtime (không từ điển) | 5 560 B | 1 878 B | 1 515 B |

Tách ra thì một phiên chỉ tải `runtime + vi` = **9 430 B** brotli, so với 14 225 B hiện tại →
**tiết kiệm 4 795 B**. Tức **thấp hơn cả ước tính "~8-9 KB" ghi trong chính mục này** — vì 2 từ
điển cấu trúc gần như giống hệt nhau nên nén chung cực tốt.

**Vì sao đóng:**

- 4 795 B ≈ **0,8%** của 570 164 B trang sảnh. Không đo được bằng cảm nhận người dùng.
- Sau #106, `i18n.js` là asset `immutable` — **tải đúng một lần rồi thôi**. Lần vào lại đã đo được
  là 0 byte qua mạng. Nên phần tiết kiệm này chỉ áp dụng cho lần tải đầu tiên.
- Sau #105, chặng origin→CF cũng đã được nén. Cái từng làm mục này nghe hấp dẫn (73 KB gửi nguyên
  si) đã không còn đúng.
- Đổi lại là rủi ro thật: `t()` hiện gọi được từ top-level ở **rất nhiều** call site; biến
  `i18n.js` thành module bất đồng bộ là thay đổi lan rộng, cộng thêm phải xử lý nháy ngôn ngữ khi
  `localStorage` đã chọn `en`.

Nếu sau này từ điển phình to đáng kể (vd. thêm 3-4 ngôn ngữ nữa) thì mở lại mục mới với số đo mới,
đừng dựa vào phép đo 2026-08-12 này.

Chi tiết số đo: [docs/fix-log/2026-08-12-do-lai-sau-106-107-108-quyet-dinh-105-109-110.md](../fix-log/2026-08-12-do-lai-sau-106-107-108-quyet-dinh-105-109-110.md).

`client/js/i18n.js` là file JS lớn thứ hai trên đường tới hạn của trang sảnh (73 467 B, sau
`socket.io.js` ở #107). Toàn bộ nội dung là một object duy nhất chứa **cả hai** ngôn ngữ:

```js
const TRANSLATIONS = {
  vi: { /* ... */ },
  en: { /* ... */ },
};
```

Mỗi người dùng chỉ xem site bằng một ngôn ngữ tại một thời điểm, nên xấp xỉ **một nửa file (~36 KB
chưa nén) là dữ liệu chết** trong mọi lần tải trang. File này được nạp ở mọi trang qua
`*-entry.js` (`import './i18n.js?v=103'`).

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa làm)

- **Hiệu quả: thấp-trung bình, và thấp hơn con số 36 KB gợi ý.** Sau nén Brotli/gzip, `i18n.js`
  còn 18 KB (giảm 76%) — hai từ điển song ngữ có cấu trúc rất giống nhau nên nén cực tốt; tách đôi
  ra chỉ tiết kiệm khoảng **8-9 KB sau nén**, không phải 36 KB. Đây là lý do mục này xếp cuối nhóm
  #105-#110.
- **Rủi ro: trung bình, cao hơn vẻ ngoài.** `i18n.js` hiện là module đồng bộ — `t()` gọi được ngay
  từ top-level của module khác. Chuyển sang nạp động (fetch/`import()` theo ngôn ngữ) biến nó thành
  bất đồng bộ và có thể gây "nháy" text chưa dịch (FOUT-kiểu-text) hoặc lỗi `undefined` ở mọi nơi
  gọi `t()` sớm. Số call site rất lớn (`data-i18n` rải khắp mọi `client/*.html` + `t()` trong hầu
  hết `client/js/*.js`).
- **Cách làm ít rủi ro hơn nếu quyết định làm:** giữ nguyên `vi` (mặc định, đại đa số người dùng)
  nội tuyến trong `i18n.js` như hiện tại, chỉ tách `en` ra file riêng nạp động **khi người dùng
  thật sự đổi sang tiếng Anh**. Cách này giữ đường tới hạn của trường hợp phổ biến hoàn toàn đồng
  bộ như cũ, không đụng tới bất kỳ call site `t()` nào.
- **Chỉ nên làm sau khi #105-#108 xong và đo lại** — nếu lúc đó tải trang đã đủ nhanh thì 8-9 KB này
  không đáng đánh đổi rủi ro.

Chi tiết: [docs/instruction/B110-i18n-ship-ca-2-ngon-ngu.md](../instruction/B110-i18n-ship-ca-2-ngon-ngu.md).
