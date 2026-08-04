# B19–B26. Nhóm phát hiện từ stress test (2026-08-02)

### B19–B26. Nhóm phát hiện từ stress test (2026-08-02)

**Quy tắc chung cho cả nhóm này — đọc trước khi đụng bất kỳ mục nào:**

- Không mục nào trong B19–B26 là bug đã xác nhận. Đợt đo chỉ chứng minh được
  điều ngược lại (tới 2000 người chơi đồng thời: không crash, không treo, không
  rò rỉ, CPU ~12% một core). Đây là **danh sách nghi vấn để đi đo tiếp**, không
  phải danh sách việc phải sửa.
- Vì vậy thứ tự bắt buộc là **tái hiện → đo → mới sửa**. Sửa "phòng xa" theo suy
  đoán ở đây vi phạm đúng rule scope discipline trong `CLAUDE.md`, và tệ hơn là
  dễ tạo regression thật để đổi lấy một cải thiện tưởng tượng.
- Nhiều mục phụ thuộc Phần A #7 (harness đa tiến trình). Nếu chưa có nó, kết quả
  đo lại sẽ tiếp tục lẫn nhiễu của chính script đo — cân nhắc làm A7 trước.

**B19 (`game:init` chậm/không tới ở tải cao):**
**✅ ĐÃ ĐO (2026-08-02) — xem TODO.md #19.** Thay vì gắn log server-side (vốn là
gợi ý ban đầu), đo được đủ từ phía client bằng cách tách chuỗi bắt tay khỏi mọi
nước đi: chạy riêng 2000 người chỉ để hoàn tất bắt tay (không chơi), ra 0 lỗi,
độ trễ tối đa 122ms — quá xa cửa sổ 15s từng gây lỗi. Chạy lại đúng bản gốc (có
6 nước đi/cặp) trên server vừa khởi động lại thì giai đoạn bị timeout **đổi**
so với lần trước (lần này `room:joined`, lần trước `game:init`) — loại được
giả thuyết (c) race cụ thể trong `syncReadyWindow`/`startGame`. **Không cần
gắn log server-side nữa, không cần sửa gì ở 4 mốc đó.**

**B20 (p95/p99 vọt lên):**
**✅ ĐÃ ĐO PHẦN GC (2026-08-02) — xem TODO.md #20.** Chạy server với
`--trace-gc` (chỉ flag chẩn đoán, không phải code mới — tránh được việc phải
làm A8 trước) trong đúng kịch bản 2000 người gây p95/p99 cao, đối chiếu log GC
với khung giờ burst chạy thật: pause GC dài nhất trong khung đó chỉ 3.92ms,
tổng GC dồn lại 98.26ms/19 giây. **Loại được GC khỏi danh sách nghi phạm.**
Đuôi latency nhiều khả năng cùng gốc với B19 (cộng dồn lưu lượng trong harness)
— xem thêm B22 cho phần fan-out.

**B21 (số timer theo số phòng):**
**✅ ĐÃ ĐO (2026-08-02) — xem TODO.md #21.** Dựng 784 ván sống song song rồi để
im hoàn toàn (0 traffic) 12 giây, đo CPU: chỉ tăng 1.3-1.5 điểm % so với
baseline, phẳng suốt 12 giây. **Xác nhận: đừng gộp interval — chưa có lý do
cần, và đây là thay đổi đụng đường đồng hồ ván đang chơi, rủi ro regression
cao hơn hẳn lợi ích chưa chứng minh** (giữ nguyên cảnh báo gốc, vì hướng gộp
interval hoá ra không cần thiết chứ không phải vì nó nguy hiểm).

**B22 (fan-out broadcast):**
**✅ ĐÃ ĐO (2026-08-02) — xem TODO.md #22.** So sánh cùng 1000 kết nối chia
theo 2 cách (500×2 người vs 50×20 người đầy đủ). Kết quả tách làm 2 nửa:
**giai đoạn ổn định (đang trao đổi nước đi) không có chi phí fan-out đáng kể**
— khán giả và người chơi chính nhận broadcast gần như cùng lúc, vì
`io.to(roomId).emit()` là 1 lệnh đồng bộ quét hết phòng trong 1 tick.
**Nhưng giai đoạn LẤP ĐẦY phòng (nhiều khán giả join dồn dập) có chi phí thật**
— mỗi `room:join` phát `room:updated` tới toàn bộ thành viên hiện có, nên 18
khán giả join gần như cùng lúc tạo ra chi phí broadcast tăng kiểu bậc hai chỉ
riêng cho giai đoạn đó, khớp với đuôi p95/p99 cao hơn hẳn quan sát được ở kịch
bản phòng đầy. **Nếu sau này cần tối ưu:** hướng đúng là debounce/gộp
`room:updated` trong giai đoạn nhiều người join gần nhau — cùng ý tưởng đã áp
dụng cho `lobby:update` ở TODO #9 — nhưng **chưa đủ lý do làm ngay**, vì "18
khán giả join cùng lúc trong <1s" hiếm khi xảy ra ngoài môi trường test tải.
để dựng phòng đầy, nhưng bằng socket thô chứ không phải 20 browser context.

**B23 (`better-sqlite3` đồng bộ + `bcrypt` chặn event loop):**
**✅ ĐÃ ĐO (2026-08-02) — không thấy ảnh hưởng ở quy mô đã test, xem TODO.md #23.**
100 ván thật (200 người) chạy nền, bắn 14 lệnh `POST /api/auth/register` thật
đồng thời giữa chừng: độ trễ nước đi không đổi (p50=1ms cả trước/trong/sau).
Request đăng ký tự nó chậm (p50=517ms — threadpool libuv chỉ 4 luồng, 14 request
tranh nhau) nhưng **không lan sang** người đang chơi, vì `bcrypt.hash()` dùng
bản Promise chạy trên threadpool chứ không chặn main thread; 2 câu SQLite đồng
bộ còn lại đủ nhanh ở DB nhỏ. **Đừng hạ `BCRYPT_ROUNDS` hay đổi gì** — chưa có
bằng chứng cần. Nếu sau này nghi ngờ lại (DB đã lớn, hoặc burst đăng ký >20
request — vượt `authLimiter`), đo lại đúng kịch bản này trước khi kết luận
khác đi; đừng dựa mãi vào kết quả ở DB gần-rỗng.

**B24 (flood protection báo nhầm):**
**✅ ĐÃ LÀM (2026-08-02) — xem TODO.md #24.** Làm chung với TEST-MATRIX row 23
đúng như gợi ý ban đầu, ra thành test thật `e2e/flood-protection.spec.ts` (2
case, không phải script tạm trong scratchpad — vì test này rẻ, ~7-8s mỗi lần,
không cần nâng cap gì nên an toàn để giữ lại trong suite thường xuyên, khác
hẳn bench row 35). 300 socket đồng thời ở 40 event/s/socket (dưới ngưỡng 50,
tổng 12 000 event/s) → 0 báo nhầm, 0 ngắt oan; đo tay thêm ở 500 socket ×
45/s (sát ngưỡng hơn) cũng 0 báo nhầm. Thiết kế đếm bằng closure riêng từng
socket (không có bộ đếm dùng chung) đã được xác nhận là an toàn dưới tải tổng
cao — **không cần sửa gì.**
**Lưu ý:** sau đó cùng ngày, chạy lại spec này ngay sau phiên B19-B22 (784+
ván trên cùng 1 server process) ra 1 lần fail (ngắt oan); restart sạch rồi
chạy 10 lần liên tiếp đều xanh. Xem TODO.md #24 mục "Lưu ý trung thực" — nếu
spec này fail lại, kiểm tra server có vừa xử lý tải nặng khác không trước khi
coi là flaky.

**B25 (đường từ chối ở cap thật):**
**✅ ĐÃ ĐO (2026-08-02), không thấy lỗi — xem TODO.md #25.** Chạy đúng ở cap
production, không nâng gì: 15 `room:create` đồng thời cùng IP → đúng 3 thành
công + 12 từ chối sạch + 1 lệnh tạo tiếp sau burst vẫn bị từ chối đúng (quota
không lệch); 40 `room:join` đồng thời vào 1 phòng → đúng 19 thành công (=
`MAX_USERS_PER_ROOM - 1`) + 21 từ chối sạch. 0 timeout, 0 rơi gói im lặng ở cả
2 case. **Không cần làm gì thêm cho mục này** trừ khi có báo cáo cụ thể mới.

**B26 (harness thành test lâu dài):** chỉ làm khi đã chốt là **cần đo định kỳ**.
Nếu chỉ đo một lần rồi thôi thì script tạm là đủ và không nên nợ thêm một bộ test
nữa phải bảo trì. Nếu làm: đa tiến trình (A7), nhịp nước đi gần người thật (hiện
nén còn 400ms/nước — không phải nhịp người), và ngưỡng pass/fail rõ ràng thay vì
chỉ in số. Đặt ở đâu cũng được **trừ** `e2e/*.spec.ts` chạy trong lần chạy suite
thông thường — nó là test phá hoại tài nguyên, không nên chạy lẫn với suite chức
năng.
**✅ ĐÃ LÀM (2026-08-02) — xem TODO.md #26.** `scripts/capacity-test/` (không
dưới `e2e/`): `orchestrator.js` fork nhiều tiến trình OS thật qua
`child_process.fork` (không phải 1 event loop giả lập), `worker.js` chơi
từng ván với độ trễ mỗi nước ngẫu nhiên (mặc định 1200-3500ms, chỉnh được qua
`--moveDelayMinMs/MaxMs`), và có ngưỡng pass/fail thật (tỉ lệ tạo phòng tối
thiểu + p95 độ trễ tối đa + 0 lỗi) thay vì chỉ in số ra màn hình.
Thêm env-var override cho `MAX_ROOMS`/`MAX_ROOMS_PER_IP`/`MAX_USERS_PER_ROOM`
trong `server/config.js` (mặc định không đổi) để đổi tải khi cần mà không phải
sửa-rồi-`git checkout` file đã track mỗi lần như cách làm ở B19-B25.
Hai lỗi bắt được lúc chạy thử, đã sửa trước khi coi là xong: (1) chỉ đợi event
thành công mà không đua với `room:error`/`game:error` nên bị từ chối quota lại
báo nhầm thành "timeout" — sửa bằng `raceSuccess()` đợi cả hai; (2) đóng socket
thô không phát `room:leave` nên phòng bị giữ qua `DISCONNECT_GRACE_MS` (60s)
trước khi nhả quota, làm 2 lần chạy liên tiếp trên cùng máy đo sai — sửa bằng
phát `room:leave` (đợi ack `room:left`) trước khi đóng. Xem
`scripts/capacity-test/README.md` mục cảnh báo `MAX_ROOMS_PER_IP` cho việc chạy
nhiều tiến trình cùng 1 máy chia sẻ 1 IP (khớp phát hiện B25, không phải bug
harness).

**Ranh giới chung cho cả nhóm:** khi cần nâng cap để đo (như B22 có thể cần),
nâng tạm rồi **trả lại bằng `git checkout` ngay trong cùng phiên**, và ghi rõ
trong báo cáo là số đo đó lấy ở cap đã nâng — đúng cách đã làm ở
`docs/stress-test-report.md`. Không commit giá trị cap đã nâng, kể cả tạm.
