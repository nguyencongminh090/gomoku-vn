# Phần B #12. Thứ tự sai tiềm ẩn trong `cancelDisconnectGrace`

**Nguồn:** kiểm chứng bản sửa (commit `3da53dd`, đo lại 2026-08-01)


12. ~~**Thứ tự sai tiềm ẩn trong `cancelDisconnectGrace`**~~
    **✅ ĐÃ XONG** (2026-08-02, commit `b7ee25a`, merge `5145b79`) — dời 3 dòng
    teardown (`clearTimeout`/`clearInterval`/`delete`) xuống **sau** cả 2 guard,
    nên nhánh bail-out để nguyên grace timer đang chạy, ván vẫn kết thúc được
    thay vì phòng kẹt `interrupted` vĩnh viễn.
    **Ràng buộc thứ 2 mà mục này chưa nêu:** teardown phải nằm **trên** vòng
    quét `otherStillAway` — nếu để xuống dưới, chính entry của người vừa vào
    lại sẽ bị đếm là "đối thủ còn trong grace" và **không ván nào resume được**
    (đây mới là lỗi thật, không còn latent). Đã ghi rõ cả 2 ranh giới trong
    comment tại chỗ và pin bằng test.
    Test: +3 case trong `DisconnectHandler.test.js`; `npm test` 264/264 xanh.
    **Mutation-check 2 chiều:** trả lại thứ tự cũ → 2 case mới đỏ; dời teardown
    xuống dưới `otherStillAway` → 4 case đỏ (gồm 3 case resume có sẵn).
    Chi tiết: `docs/fix-log.md`.

    ~~Mô tả gốc:~~ `disconnectTimers.delete()`
    chạy ở dòng 174, **trước** khi kiểm tra membership ở dòng 181. Nếu nhánh đó
    từng chạy được, grace timer bị huỷ sớm và không còn gì kết thúc ván — phòng
    kẹt vĩnh viễn ở `interrupted` (mà `_idleCleanup` lại bỏ qua trạng thái này).
    **Hiện chưa khai thác được** vì fix #6 đã chặn kick khi `interrupted` — nên
    đây là latent bug, không phải lỗi đang mở, nhưng đáng sửa vì rẻ (đổi thứ tự
    2 khối code) và loại bỏ hẳn nguy cơ nếu sau này có đường khác dẫn tới nhánh
    đó. Sửa: dời `disconnectTimers.delete()` xuống sau các kiểm tra trong
    [DisconnectHandler.js](server/socket/handlers/DisconnectHandler.js). Test:
    thêm case vào `DisconnectHandler.test.js` dựng đúng kịch bản race (membership
    mất trước khi grace hết) để xác nhận ván kết thúc thay vì kẹt.
