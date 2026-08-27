# #146 — `touchSession()` ghi SQLite đồng bộ **chắn trước** response 101 của mọi handshake

**Trạng thái:** ✅ Đã đo — **ĐÃ ĐO 2026-08-22, ĐÓNG (không sửa)**. Kết quả bench cho thấy lệnh ghi
cô lập cũng chỉ đơn vị µs, cùng bậc với lệnh đọc mà #81 đã đo và đóng trước đó — không có lợi ích đo
được để đánh đổi lấy thay đổi code. Chi tiết đo ở cuối file.

**Nguồn:** cùng phân tích HAR với #145 (`play3cr.dpdns.org_Archive [26-08-22 19-20-59].har`,
2026-08-22) — thành phần `wait: 145 ms` của entry WebSocket. Kèm đối chiếu chuẩn ngành.

## Vấn đề

`server/middleware/auth.js` `verifySocketToken()`, nhánh cookie hợp lệ:

```js
const session = sessionManager.getValidSession(sessionId);   // đọc SQLite
if (session) {
  socket.user = session;
  socket.sessionId = session.sessionId;
  sessionManager.touchSession(session.sessionId);            // ← GHI SQLite, đồng bộ
  return next();                                             // ← 101 chỉ đi sau dòng trên
}
```

`SessionManager.touchSession()` gọi `db.touchSession(...)` — **better-sqlite3, đồng bộ, chặn event
loop**, commit WAL. Nó nằm trên đường tới hạn của **mọi** handshake, và response 101 không đi được
cho tới khi nó xong.

Đây là bookkeeping thuần tuý (`last_seen`). Không có lý do gì để người chơi phải chờ nó commit.

## Vì sao #81 không phủ mục này

**#81 đã đo và đóng** với kết luận "session-lookup không phải bottleneck, p50/p99 chỉ đơn vị-chục
µs". Đúng — nhưng **#81 chỉ đo đường ĐỌC** (`getValidSession`). Đường **ghi** (`touchSession`) không
nằm trong bench đó. Đừng dùng #81 để đóng mục này lần nữa mà không đo lại đúng lệnh ghi.

## Việc cần làm

Đẩy `touchSession()` ra khỏi đường tới hạn. Hai hướng, chọn một (xem instruction):

1. Gọi **sau** `next()`, hoặc bọc trong `setImmediate` — đơn giản nhất, giữ nguyên ngữ nghĩa.
2. Chỉ ghi khi `last_seen` đã cũ hơn N phút — giảm hẳn số lệnh ghi, nhưng đổi ngữ nghĩa của cột.

Hướng 1 rẻ và an toàn hơn; chỉ chọn 2 nếu đo được rằng tần suất ghi mới là vấn đề.

## Chuẩn ngành (tra cứu 2026-08-22)

- Chuẩn chung cho auth ở handshake: token **ký sẵn, ngắn hạn**, verify được mà **không chạm
  datastore**; việc nặng đẩy sang sau khi connection open.
  ([Ably — WebSocket authentication](https://ably.com/blog/websocket-authentication),
  [websocket.org — security](https://websocket.org/guides/security/))
- **Slack** làm đúng vậy: client lấy token qua HTTP trước, Gateway Server chỉ verify rồi trả message
  đầu tiên, còn subscribe channel thì **bất đồng bộ** sau đó.
  ([slack.engineering](https://slack.engineering/real-time-messaging/))
- socket.io còn cung cấp hẳn option `skipMiddlewares` cho `connectionStateRecovery`, lý do đúng
  tinh thần này: user đã auth rồi, chạy lại middleware là phí.
  ([socket.io server options](https://socket.io/docs/v4/server-options/))
- Tài liệu về connection latency chỉ đích danh "expensive authentication logic during the handshake"
  là một trong các dấu hiệu handshake chậm ở quy mô lớn.
  ([piehost](https://piehost.com/websocket/performance-and-scalability))

## Đo (2026-08-22) — kết luận: đóng, không sửa

Theo đúng chỉ dẫn của `docs/instruction/B146-*.md` ("Đo trước, đừng tin #81"): mở rộng
`server/scripts/bench-session-lookup.js` với 2 phần mới, tách rời khỏi phần cũ (read+write gộp).

**Phần 1 — `touchSession()` cô lập** (cùng lưới `REALISTIC_TABLE_SIZES` × `REALISTIC_BURST_SIZES`
của #81, không kèm `select.get()`):

```
── sessions table: 500 rows ──
  burst     8: total     0.1 ms  |  p50    6.5 µs  p99    18.8 µs  max     18.8 µs
  burst    16: total     0.1 ms  |  p50    5.9 µs  p99     6.6 µs  max      6.6 µs
  burst    32: total     0.2 ms  |  p50    5.1 µs  p99     7.2 µs  max      7.2 µs
  burst    64: total     0.3 ms  |  p50    5.3 µs  p99     8.3 µs  max      8.3 µs
```

Cùng bậc với con số đọc mà #81 đã đo (p50 ~5-6 µs, p99 dưới 20 µs). Chi phí **riêng** của lệnh ghi so
với lệnh đọc là không đáng kể — cả hai đều là truy vấn theo khoá chính trên bảng nhỏ.

**Phần 2 — dưới tranh chấp WAL thật (connection thứ hai giữ khoá ghi)**: **20/20 lệnh block đúng
~5006 ms rồi ném `SQLITE_BUSY`** (busy_timeout mặc định của better-sqlite3 = 5000 ms). Đây **không**
phải µs — nhưng grep xác nhận `server/db/database.js` là **connection SQLite duy nhất** trong toàn
bộ production code, nên kịch bản kích hoạt (2 connection cùng ghi) **không reachable** trong kiến
trúc hiện tại. Tách riêng thành **#149** (chưa sửa, không cấp bách, chỉ ghi lại làm địa lôi) thay vì
gộp vào mục này — đúng rule "call those out separately" của `CLAUDE.md`, vì nó là một phát hiện khác
với những gì #146 đặt ra ban đầu.

**Kết luận theo đúng điều kiện instruction đã đặt ra trước**: dưới kịch bản **reachable** (không có
tranh chấp — tức mọi handshake thật hôm nay), chi phí là µs. ⇒ **đóng như tradeoff đã đo**, không
sửa `verifySocketToken`/`touchSession`. Không viết test cho một thay đổi không được thực hiện.

## Đánh giá hiệu quả / an toàn (đã đo)

- **Hiệu quả nếu sửa:** không đo được — chi phí hiện tại (µs) đã dưới ngưỡng đáng kể so với 321 ms
  TCP+TLS hay 145 ms `wait` tổng của cùng entry HAR. Đẩy nó ra khỏi đường tới hạn sẽ không thu hẹp
  được phần `wait: 145 ms` một cách có thể đo được.
- **An toàn nếu không sửa:** cao — không đổi hành vi, không rủi ro. Địa lôi WAL-busy 5s được tách
  sang #149, giữ nguyên trạng thái theo dõi.
- **Test:** không áp dụng — không có thay đổi code để test.
