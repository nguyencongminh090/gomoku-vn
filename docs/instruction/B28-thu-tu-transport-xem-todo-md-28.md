# B28. (thứ tự transport — xem TODO.md #28)

### B28 (thứ tự transport — xem TODO.md #28)

Quyết định "áp dụng hay không" phụ thuộc **mốc tải nào đang được so sánh**,
không phải một câu trả lời cố định: ở 4000 người 2 thứ tự transport đo ra y
hệt nhau (backlog fix đã đủ), nhưng ở 6000 người thì tách biệt rõ (~15 điểm %).
Nếu review lại quyết định này sau này, đo ở đúng mốc tải team đang quan tâm
tại thời điểm đó — đừng tái dùng số đo ở 4000 để kết luận cho tải cao hơn.
Rủi ro tương thích proxy (client sau proxy chặn WebSocket) vẫn **chưa** đo
được trực tiếp trong cả 2 lần xem xét mục này (không có client thật sau proxy
chặn WebSocket) — quyết định áp dụng dựa trên `tryAllTransports` giới hạn cái
giá của rủi ro đó (chậm thêm 1 lần thử, không mất kết nối), không phải trên
bằng chứng đo được rằng rủi ro đó không xảy ra.
