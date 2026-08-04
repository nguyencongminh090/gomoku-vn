# Phần A #7. Đo lại bằng harness đa tiến trình (hoặc máy thứ 2)

**Nguồn:** stress test khả năng chịu tải (2026-08-02, xem `docs/stress-test-report.md`)


#### 7. ~~Đo lại bằng harness đa tiến trình (hoặc máy thứ 2)~~

**✅ ĐÃ ĐO (2026-08-02)** — dùng `scripts/capacity-test/` (B26, xem mục 26)
với server phụ raised-cap ở cổng 3099 (đã tắt sau khi xong; server thật ở 3000
không đụng tới):

- Bắt được 1 bug thật trong chính harness trước khi tin số liệu: `worker.js`
  ban đầu chạy các phòng được giao cho 1 worker **tuần tự**, nên
  `--workers=8` chỉ tạo ra ~8 phòng đồng thời thật bất kể `--rooms` là bao
  nhiêu — đúng loại lỗi mục này lo ngại. Đã sửa thành `Promise.all` toàn bộ
  phòng của 1 worker, xác nhận bằng thời gian chạy giảm đúng tỉ lệ (150 phòng:
  100s tuần tự → 6.9s song song thật).
- Sau khi sửa: 100-400 người sạch, CPU 3-4%/1 core. **2000 người đồng thời**
  (đúng con số nghi ngờ trong báo cáo cũ): **0 lỗi**, p95=75ms, p99=135ms,
  **CPU ~37%/1 core** (số cũ 12% là giả tạo do chính harness đơn tiến trình
  nghẽn). **3000 người**: vẫn sạch 100%, CPU ~31%, RSS ~273MB. **3200 người**:
  bắt đầu lác đác lỗi (6/1600 phòng). **3500+ người**: lỗi rõ (13-18%), log
  server có `Session ID unknown` — bắt tay long-polling Engine.io va chạm khi
  hàng nghìn kết nối MỚI nổ cùng lúc.
- **Điểm gãy không phải CPU/RAM** — CPU đỉnh chỉ ~41%/1 core, RSS ~271MB ngay
  tại điểm bắt đầu lỗi. Nút thắt nằm ở bước bắt tay kết nối dưới burst cực
  đoan, không phải logic ván đấu/bộ nhớ.
- Vẫn còn giới hạn: đây là burst nhân tạo (toàn bộ N người connect cùng lúc
  qua `Promise.all`), traffic thật rải rác theo thời gian sẽ nhẹ hơn nhiều ở
  bước này — số liệu vẫn là "sàn bi quan", không phải trần thực tế.
- **Con số có thể trích dẫn**: server chịu được **~3000 người chơi đồng thời
  sạch**, bắt đầu suy giảm ở **~3200-3500+**, do bắt tay kết nối chứ không
  phải CPU/RAM. Chi tiết: `docs/stress-test-report.md` §9,
  `instruction.md` §A7.
