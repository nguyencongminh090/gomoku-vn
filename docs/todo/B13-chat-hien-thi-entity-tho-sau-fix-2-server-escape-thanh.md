# Phần B #13. Chat hiển thị entity thô sau fix #2 — server escape `<`/`>` thành

**Nguồn:** kiểm chứng bằng browser thật (Playwright, 2026-08-02)


13. ~~**Chat hiển thị entity thô sau fix #2**~~ — server escape `<`/`>` thành
    `&lt;`/`&gt;`, nhưng client render bằng `textContent`, nên người dùng gõ
    `<b>bold</b>` thì **thấy đúng chuỗi `&lt;b&gt;bold&lt;/b&gt;`** trên màn
    hình (đã xác nhận bằng browser). `R&D & co` hiển thị đúng (vì cố ý không
    escape `&`), và không có injection nào (`0` thẻ `<img>` sống).
    **✅ ĐÃ QUYẾT ĐỊNH (2026-08-02, hỏi người dùng trực tiếp — xem hội thoại,
    không phải fix code):** giữ nguyên phương án (a) — escape tại server đúng
    chữ `instruction.md` §B2. Lý do chọn: payload trên dây luôn trơ (bất kỳ
    consumer tương lai nào — client khác, admin panel, log — đều an toàn mặc
    định kể cả nếu quên tự escape), rẻ hơn việc phải giữ đúng invariant
    "mọi nơi render đều dùng `textContent`" mãi mãi. Phần hiển thị sai
    (`&lt;b&gt;` thay vì `<b>` trên màn hình) được tách thành lỗi UI riêng —
    xem mục 15 — không lẫn vào quyết định an ninh này.
