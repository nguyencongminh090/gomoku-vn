# Phần B #15. Chat hiển thị `&lt;`/`&gt;` thô thay vì `<`/`>`

**Nguồn:** kiểm chứng bằng browser thật (Playwright, 2026-08-02)


15. ~~**Chat hiển thị `&lt;`/`&gt;` thô thay vì `<`/`>`**~~
    **✅ ĐÃ XONG** (2026-08-02, commit `fed57d1`, merge `4d4d3e1`) — thêm
    `decodeChatText()` vào `client/js/escape-utils.js` (chỉ đảo `&lt;`/`&gt;`),
    áp tại 2 chỗ render text người dùng trong `chat-ui.js` (bong bóng chat +
    float message trong ván). **Không phải lỗ hổng:** `textContent` không parse
    markup, payload trên dây **vẫn escape** (giữ đúng quyết định mục 13), và
    **không** đảo `&amp;` vì server không bao giờ sinh ra nó. 2 nhánh system
    message giữ nguyên — chuỗi đó do server tự viết, chưa từng qua `sanitize()`.
    Bump `?v=31` → `?v=32`. Test: +6 case trong `escape-utils.test.js`, assert
    **round-trip với `ChatHandler.sanitize()` thật** nên 2 nửa không thể lệch
    nhau; `npm test` 280/280 xanh. **Đã kiểm browser thật:** người đọc thấy
    đúng `<b>bold</b>`, `<img src=x onerror=alert(1)`, `R&D & co`, `xin chào`,
    0 thẻ sống trong log chat; bắt luôn frame WebSocket để thấy cả 2 nửa:
    trên dây `"text":"&lt;b&gt;bold&lt;/b&gt;"`, trên màn hình `<b>bold</b>`.
    Chi tiết: `docs/fix-log.md`.

    ~~Mô tả gốc:~~ **Chat hiển thị `&lt;`/`&gt;` thô thay vì `<`/`>`** — hệ quả UI của quyết
    định giữ nguyên fix #2 (xem mục 13): server escape entity đúng như thiết
    kế, nhưng `chat-ui.js` (4 chỗ dùng `textContent` — dòng 32, 43, 49, 78) gán
    thẳng `msg.text` chưa giải mã, nên người gõ `<b>bold</b>` thấy đúng chữ
    `&lt;b&gt;bold&lt;/b&gt;` trên màn hình thay vì chữ họ gõ. Sửa: decode
    entity (`&lt;`→`<`, `&gt;`→`>`) **ngay trước khi** gán `textContent` tại 4
    điểm đó — an toàn vì `textContent` không parse lại thành thẻ dù input là
    gì. Rẻ, không đụng phần server/an ninh của fix #2. Test: client-side, có
    thể tách hàm decode thuần ra module test được qua Node (theo tiền lệ
    `escape-utils.js`) hoặc test bằng Playwright.
