# Phần A #4. Kiểm chứng thật cho các mục "CHƯA ĐO ĐƯỢC" trong review

**Nguồn:** `gomoku-vn-review(1).md` (2026-08-01, commit `87006c5`)


#### 4. Kiểm chứng thật cho các mục "CHƯA ĐO ĐƯỢC" trong review

- **Half-open socket thật** (điện thoại mất sóng, không gói FIN) — mọi cách
  ngắt trên localhost tới server ngay lập tức nên không mô phỏng được; cần
  **2 máy thật + `iptables DROP`** để đo đúng khoảng "mù" (ước tính 45s
  pingTimeout + 60s grace ≈ 105s, nhưng đây là suy luận chưa kiểm chứng).
- ~~**Timing attack trên login** (review 3.6) — `bcrypt` không load được trên máy
  đánh giá nên chưa đo được chênh lệch thời gian phản hồi thật.~~
  **✅ ĐÃ ĐO XONG (2026-08-02)** — máy này chạy được `bcrypt`, đã đo bằng 2
  git worktree (trước fix `82c861e` vs sau fix), server thật, n=60 mẫu/ca,
  bỏ 10 mẫu warmup, limiter nới **chỉ trong bản đo** (không commit):
  - **Trước:** user không tồn tại 1.10ms vs sai mật khẩu 206.27ms — **188x**,
    2 phân phối không giao nhau, 1 request là phân biệt được. Chạy lại: 1.06 vs
    203.66ms (192x).
  - **Sau:** 206.99 vs 204.12ms (lệch −2.87ms); 3 lần chạy lại: +14.61, +1.83,
    −0.18ms — **lệch đổi dấu giữa các lần chạy** và nằm trong khoảng p10–p90 của
    chính từng ca, tức là nhiễu chứ không phải tín hiệu.
  - Lưu ý giữ lại: đo trên localhost, **không có jitter mạng** — đây là điều
    kiện thuận lợi nhất cho kẻ tấn công; deploy thật còn nhiễu hơn nhiều.
- **`room:updated` ở đúng 20 người** — bị rate limiter chặn khi đo (không mint
  quá 20 guest token/15 phút/IP). Muốn đo đúng mốc `MAX_USERS_PER_ROOM = 20`
  cần restart server giữa các đợt hoặc tạm nới rate limit trên môi trường test.
