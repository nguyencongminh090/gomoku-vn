# Phần B #69. Tự host Google Fonts + audio assets để giảm rò rỉ IP người dùng cho bên thứ ba

**Nguồn:** báo cáo `network_security_audit.md` (Antigravity IDE, 2026-08-08)

## Vấn đề đã xác nhận

Mọi trang tải font từ `fonts.googleapis.com`/`fonts.gstatic.com`, và
[audio-manager.js](../../client/js/audio-manager.js) tải 6 file âm thanh từ `cdn.freesound.org` +
1 file từ `raw.githubusercontent.com`. Mỗi request này gửi IP, User-Agent, Referer của người chơi
tới Google/Freesound/GitHub — nằm ngoài kiểm soát của app. [[B65]] đã cho phép các origin này trong
CSP (`style-src`/`font-src`/`media-src`) như một đánh đổi có chủ ý, không phải bỏ sót.

## Việc cần làm

- Tải font Google Fonts hiện dùng về, tự host trong `client/vendor/fonts/` (tương tự cách [[B65]]
  đã tự host Phosphor icons), bỏ 2 origin `fonts.googleapis.com`/`fonts.gstatic.com` khỏi CSP.
- Tải 6 file audio từ Freesound + 1 file từ GitHub về, tự host trong `client/assets/audio/` (kiểm
  tra license từng file trước khi vendor — Freesound có nhiều license khác nhau theo từng sound,
  không mặc định free-to-redistribute), bỏ `cdn.freesound.org`/`raw.githubusercontent.com` khỏi
  `media-src`.
- Bump `?v=N` theo `CLAUDE.md` nếu đổi asset trong `client/js/`.
- Đây là privacy hardening có lợi nhưng **không phải lỗ hổng** — độ ưu tiên thấp, làm khi có thời
  gian rảnh giữa các task khác, không chặn gì.

## Trạng thái

✅ ĐÃ XONG (2026-08-08). Tự host Manrope (3 file subset latin/latin-ext/vietnamese, `client/vendor/fonts/manrope/`,
license SIL OFL 1.1 — free redistribute), bỏ luôn link Google Fonts `Inter` chết (không CSS nào dùng).
Audio: xác minh lại thấy `soundSources` trong `audio-manager.js` là dead code — không method nào từng đọc nó,
toàn bộ âm thanh thực tế đều synthesize bằng Web Audio API — nên **không cần vendor file audio nào**, chỉ xoá
object chết đó và bỏ `cdn.freesound.org`/`raw.githubusercontent.com` khỏi CSP `media-src`. CSP `styleSrc`/
`fontSrc`/`mediaSrc` giờ chỉ còn `'self'` (+ `'unsafe-inline'`/`data:` cũ). Chi tiết:
[docs/fix-log/2026-08-08-self-host-google-fonts-and-audio.md](../fix-log/2026-08-08-self-host-google-fonts-and-audio.md).
`npm test`: 856/856 xanh. Branch `fix/self-host-fonts-audio` off `dev` (không phải `main`, vì
`tournament.html`/`tournaments.js` chỉ tồn tại trên `dev`).
