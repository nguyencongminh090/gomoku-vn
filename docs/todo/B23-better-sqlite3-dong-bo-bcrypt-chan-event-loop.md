# Phần B #23. `better-sqlite3` đồng bộ + `bcrypt` chặn event loop

**Nguồn:** stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)


23. ~~**`better-sqlite3` đồng bộ + `bcrypt` chặn event loop**~~
    **✅ ĐÃ ĐO (2026-08-02)** — chạy 100 ván thật song song (200 người chơi, nhịp
    nước 500ms/nước) liên tục, giữa chừng bắn 14 lệnh `POST /api/auth/register`
    **thật** đồng thời (không bypass). Đo độ trễ nước đi ở 3 khoảng: trước/trong/
    sau đợt đăng ký. **Kết quả: độ trễ nước đi KHÔNG đổi** — p50=1ms cả 3 khoảng,
    p95/p99/max đều ở mức single-digit ms suốt, kể cả đúng lúc đợt đăng ký đang
    chạy (186 mẫu trong cửa sổ ~921ms của đợt bắn). **Giả thuyết ban đầu — "chặn
    toàn bộ ván đang chơi" — SAI ở quy mô đã đo.** Lý do: `bcrypt.hash()` dùng
    bản Promise (không có callback) → chạy trên libuv threadpool, **không** chặn
    main thread; phần đồng bộ thật sự (2 câu SQLite: check trùng tên + insert)
    đủ nhanh (DB nhỏ, có index) để không lộ ra ở độ trễ nước đi tại quy mô này.
    Bản thân request đăng ký thì chậm thật (p50=517ms, max=913ms cho 14 request
    đồng thời — hợp lý vì threadpool mặc định chỉ có 4 luồng, 14 request tranh
    nhau) — nhưng độ chậm đó **không lan sang** người đang chơi.
    **Giới hạn của phép đo này — đừng coi đây là đóng hẳn:** chỉ 14 request đăng
    ký cùng lúc (bị `authLimiter` 20/15 phút chặn bớt, không bắn được nhiều hơn),
    DB gần như rỗng (không đại diện DB đã có hàng nghìn user), và cửa sổ "trong
    đợt bắn" chỉ ~921ms nên số mẫu ít (186). Nếu sau này thấy nghi ngờ tương tự
    ở DB lớn hoặc burst đăng ký lớn hơn nhiều, nên đo lại chứ đừng dựa vào kết
    quả này mãi mãi. Harness: xem `docs/stress-test-report.md` (đoạn bổ sung).
