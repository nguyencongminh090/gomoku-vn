# #146 — `touchSession()` ghi SQLite đồng bộ **chắn trước** response 101 của mọi handshake

**Trạng thái:** chưa làm.

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

## Đánh giá hiệu quả / an toàn (sơ bộ, chưa đo)

- **Hiệu quả:** p50 có thể chỉ vài ms. Giá trị thật nằm ở **p99 khi có burst** — SQLite ghi đồng bộ
  chặn event loop nên nó phạt **tất cả** kết nối đang chờ, không chỉ kết nối gây ra nó. Phải đo
  trước khi khẳng định con số.
- **An toàn:** rủi ro thấp. `touchSession()` đã tự nuốt lỗi (`try/catch` + `logger.warn`) với lý do
  "một lệnh ghi bookkeeping hỏng không được làm vỡ một phiên hợp lệ" — đúng tinh thần của việc đẩy
  nó ra khỏi đường tới hạn.
- **Test:** có hạ tầng thật (`server/tests/**/*.test.js`) ⇒ **bắt buộc viết test**, không được bỏ
  qua.
