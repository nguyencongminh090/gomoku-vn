# Phần B #27. Hàng đợi accept TCP tràn — mất 12-14% kết nối ở burst lớn

**Nguồn:** truy nguyên trần kết nối (2026-08-02, xem `docs/stress-test-report.md` §10)


27. ~~**Hàng đợi accept TCP tràn — mất 12-14% kết nối ở burst lớn**~~
    **✅ ĐÃ SỬA (2026-08-02), CHƯA COMMIT** — đây là **bug thật đầu tiên** tìm
    được từ toàn bộ đợt đo tải, và là nguyên nhân gốc của trần ~3000 người ghi
    ở mục 7.
    - **Lỗi:** `server.listen(port, cb)` của Node dùng backlog mặc định **511**.
      Khi hàng nghìn kết nối MỚI ập đến cùng lúc, hàng đợi accept của kernel đầy
      và mọi SYN tiếp theo bị **drop im lặng**.
    - **Vì sao khó thấy:** drop xảy ra ở tầng kernel, **dưới** ứng dụng — không
      log, không event lỗi, CPU server chỉ ~26-42% một core trông rất khoẻ.
      Triệu chứng duy nhất là `connect timeout` ở **phía client**, rất dễ bị
      hiểu nhầm là lỗi mạng/client.
    - **Bằng chứng đo trực tiếp** (không suy đoán): `TcpExtListenOverflows`
      trong `/proc/net/netstat` tăng **+14 003** trong 1 lần chạy 4000 người ở
      backlog 511; sau khi sửa còn +3 118 và **không mất kết nối nào**.
    - **Sửa:** `server/index.js` truyền backlog tường minh
      (`server.listen({ port, backlog: config.LISTEN_BACKLOG })`), hằng số
      `LISTEN_BACKLOG` trong `server/config.js` mặc định **4096**, đổi được qua
      env. Kernel tự kẹp theo `net.core.somaxconn` nên đặt cao **an toàn**,
      máy nào cho phép ít hơn thì tự giảm chứ không lỗi.
    - **Kết quả:** 4000 người kết nối đồng thời, **đúng cấu hình transport mặc
      định đang ship**: từ 86-88% (240-282 lỗi) → **100%, 0 lỗi**, lặp lại 2 lần.
    - **Unit test:** `server/tests/listen-backlog.test.js` (5 test) — đã kiểm
      chứng là **fail đúng khi revert bản sửa**, không phải test luôn xanh.
      `npm test` 289/289 xanh.
