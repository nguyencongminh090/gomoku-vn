# B9. `lobby:update` → delta (review 4.1/13 + báo cáo kiểm chứng `3da53dd`)

### B9. `lobby:update` → delta (review 4.1/13 + báo cáo kiểm chứng `3da53dd`)

- Review gốc: "debounce 200-500ms là thắng nhanh nhất... Xa hơn là gửi delta 1
  phòng + `roomId`" — tức reviewer **coi debounce là bước tạm, không phải bước
  cuối.**
- **Báo cáo kiểm chứng đã đo lại và phát hiện debounce 300ms KHÔNG đạt mục tiêu**
  ở nhịp người chơi thật (~1200ms giữa hành động) — vẫn ra đúng 4 gói/10 759B
  như trước khi có debounce. Reviewer đề xuất cụ thể: **nâng cửa sổ lên 1-2
  giây** như một bản vá rẻ tạm thời, hoặc **làm nốt phần delta** — khi đó cửa
  sổ bao nhiêu không còn quan trọng. Không coi debounce 300ms hiện tại là "đã
  xong việc này".
