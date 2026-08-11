# #110 — `i18n.js` (73 KB) ship cả từ điển `vi` lẫn `en` dù mỗi phiên chỉ dùng một

**Trạng thái:** chưa làm

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
