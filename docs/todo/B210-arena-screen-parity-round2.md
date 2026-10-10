# B210 — Arena parity round 2: screens beyond the nav (home, rooms, tournaments, social, learn, settings, admin)
**Status:** PARTIAL 2026-10-10 — fixed on `ui/arena-parity-nav-tabs` (uncommitted, ?v=228): Rooms/Tournaments H1 is now a fixed title ("Phòng & bàn chơi"/"Giải đấu") with the live sentence as a sub-line; Admin highlights no nav item; underline tabs on rankings scope, /puzzles+/forum switcher, /admin. Open: settings width/spacing, social layout, tournaments tabs/labels, home extras, rooms tabs/"Vào bằng mã", admin unified table, mobile+light re-check.
**Area:** client/*.html + css/platform.css + the page scripts below; sibling of B209 (nav + rankings/profile/clubs)
**From:** user 2026-10-10 "ngoài Nav, có UI nào chưa khớp không"   **Depends:** B209

## Systemic
1. Tabs vs chips: mockup uses underline `.tab` for every tab group and chips only for filters. Real uses green chips for tabs on rankings scope, /puzzles (Puzzle/Diễn đàn) and /admin; underline tabs on clubs/club. Pick one rule.
2. Mockup footer links (Phòng · Học · Xã hội · Cài đặt · Quản trị · Trang CLB) have no real counterpart; Settings/Social/Admin are reachable only via gear/bell/profile (ties into B209 gear decision).

## Decided (user 2026-10-10)
- Systemic 1: **underline tabs for every tab group**; chips only for filters (rankings scope, /puzzles Puzzle/Diễn đàn, /admin → underline tabs; rule/level/tag stay chips).
- Learn: **keep as is** (R7 decision stands; replay on profile, openings + eval bar parked).
- Admin: **keep post-moderation** (#207 remove avatar); no "Ảnh chờ duyệt" queue. Mockup difference is intentional.
- Systemic 2 / Settings entry: see B211.

## Per screen
- **Home:** close. Missing "Thách đấu bạn bè" button and the "214 đang chờ · ước tính 8 giây" line; real adds "Tìm phòng". Greeting name not bold.
- **Rooms:** the empty-state sentence is rendered as the page H1 ("Chưa có bàn chơi nào đang mở."); mockup H1 "Phòng & bàn chơi" + tabs Phòng/Bàn/Quan sát + "Vào bằng mã". "Đang online" list sits inside the empty card.
- **Tournaments:** same H1 problem ("Chưa có giải đấu nào."). Filters are a tab row inside a card + "Mọi thể thức" select; mockup tabs Sắp tới/Đang diễn ra/Đã kết thúc/Của CLB; button "Tạo giải đấu" vs "Tổ chức giải".
- **Social:** mockup = Thông báo list (left) + Bạn bè with avatars/presence dots + chat (right). Real = four stacked cards (Thách đấu, Lời mời, Bạn bè, Tin nhắn) with a full-width empty Tin nhắn; no Thông báo list (only the bell panel); H1 "Bạn bè & tin nhắn".
- **Learn (/puzzles):** mockup Học = Xem lại ván/Câu đố/Khai cuộc/Lịch sử ván + replay + eval bar. Real = Puzzle/Diễn đàn chips. By design (R7: replay lives on profile, openings parked, eval placeholder) — not a bug, confirm.
- **Settings:** mockup = 520px form card; real card is full 1180 wide with fields ~400px, big dead area. Avatar hint text touches the next label ("GIỚI THIỆU") — missing gap. Save/Cancel not visible above the fold. Display-name field intentionally absent (R5).
- **Admin:** real nav highlights "Học" (`PlatformShell.build('learn')`); mockup highlights nothing. Mockup = one table (Loại/Đối tượng/Người báo/Thời gian/Xem xét) with counts on tabs "Báo cáo (7) · Nghi gian lận (2) · Ảnh chờ duyệt (5) · Người dùng". Real = per-queue lists, no counts. Mockup "Ảnh chờ duyệt" implies avatar PRE-approval; #207 built post-moderation (remove) instead — confirm intent.

## Not checked
- Mobile + light for these screens (shots taken, not viewed); Firefox/WebKit; populated data (all real screens were empty states).

## Done when
- Decisions on systemic 1–2 and the rooms/tournaments H1 bug; re-shot pairs match agreed targets.

## Update 2026-10-10 (B211)
Settings width/spacing and systemic 2 (Settings entry) resolved by B211: 720px card, 4 underline tabs, chip menu. Footer links from the mockup still not built (real pages have no footer).
