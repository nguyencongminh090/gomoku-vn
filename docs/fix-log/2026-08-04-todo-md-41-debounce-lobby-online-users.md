# Fix log entry — 2026-08-04 09:00

## Prompt

TODO.md #41 / instruction.md §41 (review 12.5, kiểm chứng 2026-08-02): `ONLINE_USERS_DEBOUNCE_MS = 300` trong `server/socket/state.js` được thêm để gộp burst đồng loạt (vd. 6000 người connect cùng lúc), và ở kịch bản đó nó hoạt động tốt (39 gói → 1 gói, giảm 97%). Nhưng review đo thêm nhịp reconnect thật — mỗi lần cách nhau 150-400ms do backoff của client (`reconnectionDelay: 1000`, `reconnectionDelayMax: 5000` trong `client/js/socket-client.js`, ngẫu nhiên hoá riêng từng socket) — thì 39 gói chỉ còn 28 (giảm ~28%), vì phần lớn các lần rơi vào cửa sổ 300ms khác nhau thay vì gộp chung.

## Action

Nâng `ONLINE_USERS_DEBOUNCE_MS` từ 300ms lên 1500ms trong [server/socket/state.js](server/socket/state.js) — đúng hướng sửa rẻ được khuyến nghị trong `instruction.md` §41 (nâng cửa sổ debounce, không đổi payload). 1.5s vẫn nhỏ hơn khoảng cách tối thiểu >1s giữa 2 lần reconnect của CÙNG một socket, nên không gộp nhầm 2 lần reconnect thật của cùng 1 kết nối thành 1. Export thêm `ONLINE_USERS_DEBOUNCE_MS` trong `module.exports` để test tham chiếu trực tiếp thay vì hard-code số. Không đụng `LOBBY_UPDATE_DEBOUNCE_MS` (300ms, dùng cho `lobby:patch`/`broadcastLobbyUpdate`) — đó là cơ chế delta riêng, đã có ghi chú trong code là cửa sổ không còn load-bearing sau khi chuyển sang gửi delta; không thuộc phạm vi #41. Không đụng logic gộp burst-đồng-loạt (giữ nguyên WeakMap per-`io` timer), tránh hồi quy TODO #29.

## Decision

Không làm hướng sửa thật (chuyển `lobby:online_users` sang delta `{added, removed}` giống `lobby:patch`) — `instruction.md` §41 ghi rõ đây là "xa hơn, không bắt buộc trong lần này". Chọn 1500ms thay vì khoảng 1-2s khác trong dải khuyến nghị vì đủ lớn để gộp phần lớn nhịp reconnect rải rác 150-400ms/lần (đo được số gói giảm mạnh trong test mới), mà vẫn đủ nhỏ để user thấy danh sách online cập nhật gần-tức-thời khi connect lần đầu (không phải reconnect storm).

## Summary output

`npm test`: 401/401 xanh (từ 379 trước đó, tăng do các fix #36/#37 khác đã merge trong lúc này, không liên quan tới #41). Sửa `server/tests/SocketHandler.test.js`: 2 test cũ (`lobby:online_users is broadcast once...`, `a burst of connects/disconnects...collapses to one...`) đổi từ hard-code `jest.advanceTimersByTime(300)` sang `jest.advanceTimersByTime(ONLINE_USERS_DEBOUNCE_MS)` để không vỡ khi đổi hằng số. Thêm test case mới `TODO.md #41: reconnect traffic spread 150-400ms apart...` — mô phỏng 12 lần connect cách nhau 150-400ms (đúng nhịp review đo được, không phải burst đồng loạt), assert số gói `lobby:online_users` phát ra ≤3 (đo thực tế: 2 gói cho 12 sự kiện, so với 12 gói nếu không debounce, và so với baseline cũ ~28% giảm ở cửa sổ 300ms). Không viết Playwright cho mục này — thay đổi chỉ là 1 hằng số thời gian phía server, không có DOM/UI liên quan để verify qua browser.
