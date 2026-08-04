# B11. Viết lại test đã bị xoá cho 6 fix (phát hiện từ báo cáo kiểm chứng)

### B11. Viết lại test đã bị xoá cho 6 fix (phát hiện từ báo cáo kiểm chứng)

- Reviewer chỉ rõ: *"các test đó đã viết rồi - chỉ cần giữ lại thay vì xoá"* —
  nghĩa là khi làm lại, tra đúng mô tả "Bằng chứng" của từng fix trong
  `docs/fix-log.md` để tái tạo đúng kịch bản test đã chạy qua (không cần thiết
  kế lại từ đầu), rồi giữ trong `server/tests/` vĩnh viễn.
- 6 fix cần test: #2 (isGuest thật), #3 (`!noScore`), #4 (không resume khi đối
  thủ còn grace), #6 (chặn kick khi `interrupted`), #7 (flood: 1 warning/cửa sổ
  + disconnect khi tái phạm), #12 (debounce lobby).
