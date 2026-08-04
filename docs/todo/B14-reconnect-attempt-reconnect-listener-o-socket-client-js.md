# Phần B #14. `reconnect_attempt`/`reconnect` listener ở `socket-client.js` không bao

**Nguồn:** kiểm chứng bằng browser thật (Playwright, 2026-08-02)


14. ~~**`reconnect_attempt`/`reconnect` listener ở `socket-client.js` không bao
    giờ chạy**~~
    **✅ ĐÃ XONG** (2026-08-02, commit `c149bc4`, merge `d32a149`) — chuyển cả 2 listener sang
    `this.socket.io.on(...)` (Manager), gộp phần cập nhật banner và phần set cờ
    `reconnect` trong auth payload vào chung 1 handler `reconnect_attempt` (2
    listener cũ cho cùng 1 event, 1 cái chết 1 cái sống — nay chỉ còn 1). Bump
    `?v=32` → `?v=33`. Test: file mới `e2e/reconnect-banner.spec.ts`
    (Playwright) — `context.setOffline(true)` trên browser thật + server thật,
    assert banner đi từ "Mất kết nối..." sang "Kết nối lại... (lần N)" rồi tắt
    khi online lại. **Đã chạy test này trên bản lỗi trước khi sửa** — đỏ đúng
    như dự đoán (banner kẹt ở "Mất kết nối..."), sau đó xanh khi khôi phục fix.
    **Tiện thể sửa luôn 1 lỗi có sẵn không liên quan** mà test này lộ ra:
    `playwright.config.ts` chưa set `baseURL`, nên mọi e2e test dùng
    `page.goto()` tương đối — kể cả `e2e/homepage.spec.ts` đã commit trước đó —
    đều lỗi "Cannot navigate to invalid URL"; đã set `http://localhost:3000`
    (override được qua `PLAYWRIGHT_BASE_URL`). Chi tiết: `docs/fix-log.md`.
