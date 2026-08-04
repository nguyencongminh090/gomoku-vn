# Phần B #10. `timer:tick` → gửi `deadline` 1 lần/lượt (review 4.3) — client tự

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


10. ~~**`timer:tick` → gửi `deadline` 1 lần/lượt** (review 4.3) — client tự
    đếm ngược.~~
    **✅ ĐÃ XONG** (2026-08-02, commit `30ff8b4`, merge `99a06cb`) —
    `TimerManager.getSync()` trả `{black, white, activeColor, deadline,
    serverTime, running}`; chỉ emit `timer:sync` ở các điểm **gãy** (bắt đầu
    ván, Swap2 xong, cộng giờ, pause khi mất kết nối, resume, payload vào lại
    phòng). Đổi lượt **đi ké trong `game:moved`** (`timerSync`) nên 1 nước vẫn
    đúng 1 gói. `onTick` thành no-op — interval vẫn chạy phía server để giữ
    đồng hồ chuẩn + bắt timeout. Client `room-socket.js` tự đếm 1s/lần từ
    deadline. Bump `?v=30` → `?v=31`.
    **Có gửi kèm `serverTime`** dù `instruction.md` §B10 nói reviewer không yêu
    cầu — client tính theo offset, không so đồng hồ máy mình với timestamp
    tuyệt đối, nên máy lệch giờ vẫn đếm đúng; giá 1 con số/gói.
    **Lệch so với dự đoán của TODO:** describe "start/tick" trong
    `TimerManager.test.js` **không cần viết lại** — `onTick` không đổi hành vi,
    chỉ là không còn nối vào socket, nên test cũ vẫn đúng; đã giữ nguyên và
    thêm 9 case mới (gồm 1 case replay đúng phép tính của client từng giây và
    2 guard mức source: không còn chỗ nào emit `timer:tick`). `npm test`
    232/232 xanh; mutation-check: bật lại emit mỗi giây thì 2 guard đỏ.
    **Đã kiểm browser thật** (2 khách chơi ván thật): 2 client hiện đồng hồ
    giống hệt nhau, **0 gói trong 6 giây không ai đi**, 0 lỗi JS.
    **Đo thật (1 client, cùng kịch bản):** trước 11 gói/521B → sau 2 gói/374B;
    quy ra 1 phút chơi ở nhịp 8 nước/phút: 3368B → 1960B (**giảm 41.8%**), còn
    lúc nhàn rỗi thì giảm **tuyệt đối** (0B thay vì 40B/giây).
    Chi tiết: `docs/fix-log.md`.
