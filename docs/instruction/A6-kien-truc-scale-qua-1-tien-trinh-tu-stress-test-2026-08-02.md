# A6. Kiến trúc scale quá 1 tiến trình (từ stress test 2026-08-02)

### A6. Kiến trúc scale quá 1 tiến trình (từ stress test 2026-08-02)

- **Đừng bắt đầu việc này vì lý do hiệu năng.** Số đo hiện có: 2000 người chơi
  đồng thời / 1000 ván → CPU ~12% của **một** core, RSS ~200MB, không crash,
  không rò rỉ. Trần 1 core còn rất xa. Lý do chính đáng để làm là **HA / không
  chấp nhận mất ván khi restart**, không phải throughput.
- Nếu vẫn làm: `cluster` hay nhiều instance đều **không chạy được nếu chỉ thêm
  process** — state phòng đang nằm trong RAM tiến trình (`RoomManager.rooms`,
  và `sessions`/`timerMap`/`disconnectTimers`/`readyTimers` trong
  `server/socket/state.js`). Bắt buộc kèm đủ 3 thứ: sticky session ở proxy,
  adapter cho socket.io (`@socket.io/redis-adapter` hoặc tương đương), và đưa
  state phòng ra store ngoài. Làm thiếu một trong ba thì lỗi sẽ ra dưới dạng
  "người chơi cùng phòng rơi vào 2 instance khác nhau", rất khó lần.
- Đây cũng là lúc phải trả lời câu hỏi mà hiện tại đang ngầm chấp nhận: **mất
  tiến trình = mất mọi ván đang chơi**. Nếu điều đó vẫn chấp nhận được thì phần
  lớn công sức ở trên là không cần thiết.
