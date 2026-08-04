# A7. Đo lại tải bằng harness đa tiến trình (từ stress test 2026-08-02)

### A7. Đo lại tải bằng harness đa tiến trình (từ stress test 2026-08-02)

- Vấn đề của số liệu hiện tại: script tạo tải và phần đo **chạy chung 1 tiến
  trình Node**, tự nó cũng đơn luồng và cũng đang bị dồn event loop ở mức 2000
  socket. Không tách được "server hết sức" với "script hết sức".
- Bằng chứng cụ thể cho việc chưa tin được: **cùng điều kiện (2000 người, cửa sổ
  15s) ra 15.2% lỗi khi chạy trong ramp nhưng 2.5% khi chạy riêng.** Ngưỡng thật
  không dao động kiểu đó.
- Cách làm đúng: tách tải ra nhiều tiến trình OS (hoặc máy thật thứ 2 qua LAN),
  mỗi tiến trình giữ một phần số socket, gom kết quả lại sau. Trước khi có việc
  này, **không được trích con số "2000 là ngưỡng"** ra ngoài — nó chưa được
  chứng minh là ngưỡng của server.

**✅ ĐÃ ĐO LẠI (2026-08-02), dùng đúng harness đa tiến trình vừa build ở B26**
(`scripts/capacity-test/`, server phụ raised-cap ở cổng 3099, đã tắt sau khi
xong — server thật ở 3000 không đụng tới):

- **Bắt được 1 bug thật trong chính harness trước khi tin số liệu**: `worker.js`
  ban đầu chạy các phòng được giao **tuần tự** trong 1 tiến trình (`for` +
  `await` từng phòng), nên `--workers=8` chỉ thật sự tạo ra ~8 phòng đồng thời
  bất kể `--rooms` là bao nhiêu — y hệt vấn đề đang muốn sửa. Đã sửa thành
  `Promise.all` toàn bộ phòng được giao cho 1 worker, xác nhận bằng thời gian
  chạy giảm đúng theo tỉ lệ (150 phòng: 100s tuần tự → 6.9s song song thật).
- **Kết quả sau khi sửa, tăng dần**: 100/300/400 người đều sạch, CPU thấp
  (3-4% của 1 core). Ở **2000 người chơi đồng thời (1000 ván) — đúng con số
  báo cáo cũ nghi ngờ**: **0 lỗi**, p95=75ms, p99=135ms, nhưng **CPU ~37% của
  một core** (so với 12% ghi nhận trước đây bằng harness đơn tiến trình bị
  confound — con số cũ thấp giả tạo vì bản thân script tạo tải cũng nghẽn).
  **3000 người**: vẫn sạch 100%, CPU ~31%, RSS ~273MB. **3200 người**: bắt đầu
  lác đác lỗi (6/1600 phòng, "connect timeout"). **3500+ người**: lỗi rõ rệt
  (13-18%), log server xuất hiện `Session ID unknown` — dấu hiệu kinh điển của
  việc handshake long-polling Engine.io va chạm khi có hàng nghìn kết nối MỚI
  cùng lúc trong vài trăm ms.
- **Phát hiện quan trọng: điểm gãy không phải CPU/RAM** — CPU đỉnh chỉ ~41%
  của 1 core, RSS ~271MB ngay tại điểm bắt đầu lỗi (3200-4000 người). Nút thắt
  nằm ở **bước bắt tay kết nối** (Engine.io polling→websocket) khi có hàng
  nghìn *kết nối mới* nổ ra đồng thời trong cùng một khoảnh khắc, không phải ở
  logic ván đấu hay bộ nhớ.
- **Giới hạn của phép đo này vẫn còn**: đây vẫn là burst nhân tạo — toàn bộ
  N người "connect cùng lúc" trong `Promise.all`, không phải traffic thật đến
  rải rác theo thời gian (traffic thật rải rác sẽ ít áp lực hơn nhiều lên bước
  handshake này, nên đây vẫn là "sàn bi quan" chứ không phải trần thực tế —
  đúng như đã ghi trong `docs/stress-test-report.md` §6).
- **Kết luận có thể trích dẫn**: với harness đa tiến trình thật (không còn bị
  confound bởi chính script đo), server chịu được **~3000 người chơi đồng
  thời sạch sẽ**, bắt đầu suy giảm ở **~3200-3500+** — và nguyên nhân là bước
  bắt tay kết nối dưới burst cực đoan, không phải CPU/RAM (vẫn còn rất nhiều
  dư địa ở cả hai). Số liệu tại `docs/stress-test-report.md` §9.
