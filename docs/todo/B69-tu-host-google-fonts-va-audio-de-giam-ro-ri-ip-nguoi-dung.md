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

Chưa làm.
