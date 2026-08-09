# B88 — Khán giả bị khoá nút "Quay lại chi tiết giải đấu" giống người chơi (hướng dẫn thực thi)

Nguồn: báo cáo người dùng, TODO.md #88 (2026-08-09).

## Bối cảnh kỹ thuật (đã xác nhận qua code, không suy diễn)

Mọi socket trong phòng trận đấu (`tournament-match:<pairingId>`) — cả 2 người chơi lẫn khán
giả — chạy chung 1 bản `client/js/tournament-match.js`, và `setLeaveLocked(true)` bị gọi vô điều
kiện ở cả 3 nơi (dòng 71, 134, 779) mà không phân biệt vai trò. `myPlayer()`/`myColor` đã đủ để
phân biệt: `myPlayer()` trả về `null` cho bất kỳ ai không phải 1 trong 2 entry của
`gameState.players` — tức khán giả (kể cả guest).

## Cách làm

Gate cả 3 lời gọi khoá theo `myPlayer()` — chỉ khoá khi user hiện tại thực sự là 1 trong 2 người
chơi của pairing này:

- **Dòng 134 và 779** — đơn giản: đổi `setLeaveLocked(true)` thành gate theo `myPlayer()`, ví dụ
  `if (myPlayer()) setLeaveLocked(true);` (dòng 134 đã có `mp = myPlayer()` ngay phía trên, dùng
  lại biến đó thay vì gọi lại hàm).
- **Dòng 71 (page load, trước khi `tmatch:init` về)** — đây là chỗ cần cẩn thận: tại thời điểm
  này `gameState` vẫn `null` (chưa nhận `tmatch:init`, xem dòng 121/128-134), nên `myPlayer()`
  LUÔN trả `null` ở đây bất kể user thật sự là ai — không thể dùng `myPlayer()` để quyết định lúc
  này. Cách đúng: **bỏ hẳn lời gọi `setLeaveLocked(true)` mù ở dòng 71**, để trạng thái mặc định
  là "không khoá" (link giữ nguyên `href="#"` hoạt động bình thường) cho tới khi `tmatch:init`
  (dòng 134) — nơi đầu tiên biết chắc vai trò thật — tự quyết định khoá hay không. Cửa sổ hở giữa
  page-load và khi `tmatch:init` về (1 round-trip socket, thường vài chục ms) không phải vấn đề:
  đây không phải hành vi mới bị nới lỏng, chỉ là dời thời điểm khoá tới đúng lúc biết đủ thông
  tin để khoá đúng đối tượng.
- **Dòng 722 (`setLeaveLocked(false)`, mở khoá khi pairing quyết định xong)** — giữ nguyên, mở
  khoá cho tất cả (bao gồm khán giả) là đúng vì lúc này không còn gì cần khoá nữa, vô hại nếu áp
  dụng cho khán giả (họ vốn chưa từng bị khoá).

## Bẫy cụ thể

- **Đừng bỏ khoá hoàn toàn cho người chơi thật** — hành vi khoá mid-series cho 2 người chơi
  (đúng mục đích gốc, chống "wandering off") phải giữ nguyên. Đây là mở rộng phạm vi "ai được
  MIỄN khoá", không phải xoá cơ chế khoá.
- **`myPlayer()` phụ thuộc `gameState`** — đảm bảo mọi lời gọi gate đều xảy ra SAU khi
  `gameState` đã được set (trong hoặc sau `tmatch:init` handler), không gọi `myPlayer()` ở dòng
  71 rồi tưởng nó "đúng" — nó sẽ luôn `null` ở đó, dẫn tới bug ngược (khoá sai/không khoá đúng
  lúc) nếu logic dựa vào giá trị đó ở thời điểm sai.
- **Guest xem (không đăng nhập tài khoản thật) vẫn phải được coi như khán giả bình thường** —
  `myPlayer()` đã tự động xử lý đúng việc này (so khớp theo `userInfo.userId`, không quan tâm
  `isGuest`), không cần thêm nhánh riêng cho guest.
- **Verify cả 2 vai trò trong cùng 1 phiên test**, không chỉ 1: người chơi (bị khoá đúng
  mid-series, mở khoá đúng lúc pairing quyết) VÀ khán giả (không bao giờ bị khoá, ở bất kỳ thời
  điểm nào trong vòng đời trận đấu — kể cả reconnect giữa series).
- **Không cần đổi phía server** (`TournamentMatchHandler.js`/`TournamentHandler.js`) — đã xác
  nhận không có cơ chế khoá điều hướng nào ở server, đây thuần là link bị disable phía client.

## Không thuộc phạm vi (đừng gộp vào fix này)

- Không đổi hành vi khoá cho 2 người chơi thật khi đang mid-series — đó là thiết kế cố ý (comment
  dòng 61-63 trong file), chỉ đang bị áp dụng nhầm đối tượng.
- Không đụng link logo `topnav__brand` (`index.html`) — nó chưa từng bị khoá và không liên quan
  tới báo cáo này.
- Không thêm cơ chế khoá mới (ví dụ `beforeunload`) cho bất kỳ vai trò nào — báo cáo chỉ yêu cầu
  khán giả KHÔNG bị khoá, không yêu cầu siết chặt thêm gì cho người chơi.
