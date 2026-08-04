# B48. Tournament (Tables & Tournaments) — từ yêu cầu người dùng, thảo luận 2026-08-04

### B48. Tournament (Tables & Tournaments) — từ yêu cầu người dùng, thảo luận 2026-08-04

**Nguồn:** không phải từ review bên ngoài — người dùng tự đề xuất tính năng
Tournament, đã thảo luận nhiều vòng (mode Swiss/Round robin/Double
Elimination, time management kiểu World Blitz Cup, vai trò Organizer),
chốt tên gọi "Tables & Tournaments", duyệt blueprint layout, rồi yêu cầu
dựng mockup front-end trước khi làm thật.

## Tài liệu nguồn — đọc theo thứ tự này trước khi code bất kỳ dòng nào

1. `features/tournament/user_story.md` — actor (Organizer, Player), user
   stories, rule cấu hình được, và **ràng buộc kiến trúc cứng: Tournament
   phải tách biệt khỏi casual game session** (không tái dùng
   `GameHandler`/`RoomHandler` nguyên trạng).
2. `features/tournament/diagram/uml_diagram/sequence-match-scheduling.md` —
   sequence diagram luồng tự-thoả-thuận lịch giữa 2 người chơi → báo server
   → check-in → server tính giờ + kết quả.
3. `features/tournament/diagram/state-diagram-match-lifecycle.md` — state
   machine đầy đủ của 1 cặp đấu (Paired → Negotiating → Reported → Ready →
   InProgress/Walkover/DoubleNoShow → Completed), kèm class diagram khái
   niệm (KHÔNG phải schema cuối cùng).
4. `features/tournament/planning.md` — **10 câu hỏi mở, bắt buộc phải được
   người dùng trả lời trước khi thiết kế data model/API thật.** Đừng tự suy
   đoán câu trả lời rồi code — mỗi câu trả lời sai sẽ kéo theo phải sửa lại
   schema/API đã viết.
5. `client/tables-tournaments-mockup.html` (nhánh
   `feature/tables-tournaments-mockup`, branch off `dev`) — mockup tĩnh đã
   duyệt: tab switcher "Bàn chơi"/"Giải đấu" ngay dưới header, sidebar
   "Đang online" giữ nguyên xuyên suốt 2 tab, tab Giải đấu có filter
   row (trạng thái + thể thức) và card giải đấu (tên, badge thể thức,
   trạng thái, số người chơi, organizer, dòng trạng thái riêng cho người
   xem). Đã áp dụng: touch target 44px, `focus-visible` ring, card có
   `tabindex="0"` + `role="link"` + `aria-label` cho keyboard nav,
   spacing theo lưới 4px, `prefers-reduced-motion`. Đã verify bằng
   Playwright ở light/dark theme, keyboard-tab focus, viewport 390px —
   **coi các quyết định UI này là đã chốt, không thiết kế lại từ đầu.**

## Quyết định đã chốt — không cần hỏi lại

- Tên gọi tính năng: **"Tables & Tournaments"**.
- Vị trí trong UI: 1 trang Lobby duy nhất, tab switcher (không phải route
  `/tournaments` riêng) — xem lý do trade-off đã thảo luận (giữ tất cả
  trong 1 URL, tái dùng sidebar/actions).
- Bảng màu: **dùng nguyên token hiện có** (`--c-brand: #4F46E5` v.v. trong
  `client/css/main.css`) — đã đối chiếu với bộ màu tham chiếu SaaS/dashboard
  của skill `ui-ux-pro-max` (`#2563EB`/`#3B82F6` "trust blue") và xác nhận
  brand indigo hiện tại của site đã đúng convention, **không cần đổi màu**.
  Không áp bảng màu "gaming/neon" (`#7C3AED` nền tối, Russo One) mà skill đề
  xuất cho từ khoá "gaming tournament" — sai tông với phần còn lại của site.

## Bẫy cụ thể — dễ làm sai nếu không đọc kỹ

- **Đừng tái dùng `RoomManager.createRoom()`/`GameHandler` cho session
  tournament match.** Ràng buộc kiến trúc đã ghi rõ trong `user_story.md` —
  tournament match có thể tái dùng primitive cấp thấp hơn (`TimerManager`
  cho đồng hồ trong ván) nhưng session/state phải là của riêng tournament.
- **Đừng tự quyết định nghĩa "overtime (by date)"** (per-round/per-match/
  per-tournament) hay **"punishment"** — đây là 2 trong 10 câu hỏi mở, sai
  1 trong 2 sẽ làm sai toàn bộ walkover logic.
- **CSS mới cho tab/card mockup đang nằm inline trong chính
  `client/tables-tournaments-mockup.html`**, cố ý không đưa vào
  `client/css/lobby.css` — khi tính năng chuyển sang triển khai thật (nối
  vào `index.html`/`lobby.js` production), **lúc đó mới** tách các rule đó
  ra file css thật dưới `client/css/` và **nhớ bump `?v=N`** theo rule
  `CLAUDE.md` (rule này chưa áp dụng cho giai đoạn mockup vì mockup không
  nằm trong bundle versioned).
- **Đừng xoá banner cảnh báo mockup** (`.mock-banner`) cho tới khi trang
  thật sự được nối logic — đây là dấu hiệu duy nhất phân biệt file mockup
  với trang production trong `client/`.

## Thứ tự đề xuất khi bắt đầu làm thật (sau khi câu hỏi mở đã được trả lời)

1. Chốt câu trả lời cho 10 câu hỏi mở → cập nhật `features/tournament/planning.md`
   (ghi thêm, không sửa đè quyết định cũ — xem rule append-only tương tự
   `docs/fix-log.md` nếu áp dụng được).
2. Thiết kế data model thật (không phải class diagram khái niệm trong
   `state-diagram-match-lifecycle.md`) — quyết định SQLite schema mới trong
   `server/db/schema.sql`.
3. Viết socket handler tournament mới (không sửa `GameHandler`/`RoomHandler`
   hiện có ngoài các điểm tích hợp tối thiểu cần thiết).
4. Nối UI: chuyển nội dung đã duyệt trong
   `client/tables-tournaments-mockup.html` vào `client/index.html` thật +
   `client/js/lobby.js`, tách CSS mockup ra `client/css/` + bump `?v=N`.
5. Viết Jest test cho toàn bộ state transition (bám theo case table trong
   `state-diagram-match-lifecycle.md`) trước khi coi là xong — theo rule
   "Writing comprehensive test cases" trong `CLAUDE.md`.
6. Tiếp tục làm trên `feature/tables-tournaments-mockup` (hoặc branch
   `feature/tournament-*` mới nếu tách nhỏ hơn) — branch off `dev`, merge
   `dev` khi ổn định, theo git workflow đã có trong `CLAUDE.md`.

---
