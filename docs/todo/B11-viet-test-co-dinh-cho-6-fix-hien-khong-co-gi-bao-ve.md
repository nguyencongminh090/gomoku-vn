# Phần B #11. Viết test cố định cho 6 fix hiện không có gì bảo vệ

**Nguồn:** kiểm chứng bản sửa (commit `3da53dd`, đo lại 2026-08-01)


11. ~~**Viết test cố định cho 6 fix hiện không có gì bảo vệ**~~
    **✅ ĐÃ XONG** (2026-08-02, commit `cdd57b0`, merge `3634d63`) — khôi phục
    đủ 6, dựng lại đúng kịch bản ghi trong cột "Bằng chứng" của từng fix:
    file mới `flood-protection.test.js` (9 case, fix #7 — bắt middleware qua
    chính `io.use()` vì nó không export), file mới `save-game.test.js` (10 case,
    fix #2 + #3 — chạy schema thật + INSERT thật trên SQLite in-memory, FK ON),
    mở rộng `RoomManager.test.js` (+3, fix #6), `DisconnectHandler.test.js`
    (+3, fix #4), `lobby-delta.test.js` (+4, fix #12). `npm test` 261/261 xanh
    (+29 case). **Mutation matrix — gỡ từng fix một, chạy lại cả suite:**
    #2 → 1 đỏ, #3 → 1 đỏ, #4 → 2 đỏ, #6 → 1 đỏ, #7 → 2 đỏ, #12 → 1 đỏ.
    Trước đây cả 6 đều **không** bị bắt.
    **Lưu ý thu hẹp phạm vi cho #12:** sau khi có delta (mục 9), gỡ debounce
    **không còn đổi số gói** — flush thừa trên state không đổi thì diff ra rỗng
    và không gửi gì, nên mọi assert theo số gói đều xanh giả. Thứ debounce còn
    bảo đảm là **1 timer/burst thay vì 1 timer/lệnh gọi**, test assert đúng
    điều đó (`jest.getTimerCount()`). Chi tiết: `docs/fix-log.md`.

    ~~Mô tả gốc:~~ mutation test (gỡ
    từng fix khỏi 1 bản copy, chạy lại suite) cho thấy gỡ **bất kỳ cái nào** trong
    fix #2 (isGuest thật), #3 (`!noScore`), #4 (không resume khi đối thủ còn
    grace), #6 (chặn kick khi `interrupted`), #7 (flood: 1 warning/cửa sổ + ngắt
    khi tái phạm), #12 (debounce lobby) đều cho **145/145 xanh y hệt** — không
    test nào bắt được. `docs/fix-log.md` tự ghi nhận đã *"wrote and ran (then
    discarded)"* các test này cho từng fix lúc implement — tức test **đã viết
    rồi, chỉ cần khôi phục lại và giữ trong suite** thay vì viết mới từ đầu.
    **Đây là việc rẻ nhất, giá trị cao nhất trong toàn bộ TODO**: không cần thiết
    kế gì mới, chỉ cần lấy lại đúng test đã chạy qua một lần khi làm fix (xem mô
    tả từng fix trong `fix-log.md` để biết chính xác kịch bản test đã dùng) và
    thêm vào `server/tests/`. Khớp đúng rule "Bug-fix workflow" mới thêm vào
    `CLAUDE.md` — không xoá test sau khi viết.
