# A8. Quan sát heap/GC của server đang chạy (từ stress test 2026-08-02)

### A8. Quan sát heap/GC của server đang chạy (từ stress test 2026-08-02)

**Cập nhật: câu hỏi cụ thể "GC có gây đuôi p95/p99 không" đã trả lời được
(TODO.md #20) mà KHÔNG cần làm mục này** — chỉ cần khởi động lại server với cờ
`--inspect`-tương-đương là `--trace-gc` (flag chẩn đoán thuần, không phải code
mới, không cần endpoint debug hay APM), log ra timestamp + thời lượng từng lần
GC, đối chiếu với khung giờ chạy tải. Đủ để loại GC khỏi nghi phạm cho câu hỏi
đó. Phần dưới đây vẫn giữ nguyên cho lần sau nếu cần quan sát heap/GC **sâu
hơn** (vd. tìm leak dần theo thời gian, không chỉ "GC có pause dài lúc burst
không"):

- RSS lấy từ ngoài bằng `ps` **không** cho thấy heap used/limit — chỉ
  `--trace-gc`/`--inspect` mới thấy được từng lần GC cụ thể.
- 3 hướng, chọn theo mức độ sẵn sàng vận hành: chạy `--inspect` rồi lấy profile
  (rẻ nhất, chỉ dùng lúc đo), thêm endpoint debug trả `process.memoryUsage()`
  **và phải tắt ở production** (nếu chọn hướng này thì phần code rất nhỏ, nhưng
  nhớ nó là bề mặt tấn công mới), hoặc gắn APM thật.
- **Đừng import trực tiếp module server vào tiến trình đo** để đọc bộ nhớ — server
  là tiến trình OS riêng, làm vậy chỉ đo được bộ nhớ của chính script đo.

---
