# B210 — Arena parity round 2: screens beyond the nav (home, rooms, tournaments, social, learn, settings, admin)
**Status:** ✅ DONE 2026-10-10 — slice 1 + 2 merged on dev; slice 3 on `ui/arena-parity-b210b` (uncommitted, ?v=241): Của CLB tab, queue-wait count. npm test 136 suites / 2666. Items deliberately not built are listed under "Decided not to build" — reopen if wanted.
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

## Built (2026-10-10, `ui/arena-parity-b210`)
- Social: two columns — Thông báo (bell list, one fetch via `PlatformShell.notifications`) · Thách đấu · Lời mời | Bạn bè + Đã gửi · Tin nhắn; H1 "Thông báo, bạn bè & tin nhắn".
- Rooms: **Vào bằng mã** (3-char code, `#A3F`, validated like RoomManager._generateRoomId, then `joinRoom`); online line separated by a divider. Home: **Thách đấu bạn bè** (→ /social.html, members only), greeting name weight 800.
- Admin: open-queue counts on the Duyệt puzzle / Báo cáo diễn đàn / Gian lận tabs (label is its own span so a language switch keeps the count).
- Re-checked mobile + light for home/rooms/tournaments/social: no layout break (shots viewed).
## Not done
- Tournaments tab labels ("Sắp tới", "Của CLB" needs a club filter on the list API) and "Tổ chức giải" wording (real already says "Tạo giải đấu"). Rooms tabs Phòng/Bàn/Quan sát (no such room kinds). Home "214 đang chờ · ước tính 8 giây" (needs queue stats from the server). Admin unified table (Loại/Đối tượng/Người báo…). Admin counts not browser-checked (needs a staff account); populated-data pass; Firefox/WebKit.

## Built (slice 3, `ui/arena-parity-b210b`)
- Tournaments: **Của CLB** tab (members who belong to a club; hidden otherwise) + club name on cards. Server: `listTournaments()` adds `clubSlug`/`clubName` via `ClubService.tournamentClubs()` (one JOIN query; `club_id` lives only in the DB and is NULLed on club delete, so it is not read off the in-memory tournament).
- Home: "N người đang chờ" on the quick-match line for the selected rule|time. Server: `MatchQueue.counts()` → `GET /api/home` `queue` (lazy MatchHandler require). No "ước tính N giây": nothing measures it, so it is not invented.
## Decided not to build (reopen on request)
- Rooms tabs Phòng/Bàn/Quan sát: the product has one room kind; the mockup tabs have no data behind them.
- Admin unified reports table: puzzles (board review) and users (graph) have their own detail views; the mockup table only fits forum + cheat reports. Tab counts shipped instead.
- Tournaments tab set: kept "Tất cả" (+ Sắp diễn ra / Đang diễn ra / Đã kết thúc) rather than the mockup's default "Sắp tới", so active/finished cups stay one click away; button already reads "Tạo giải đấu".
- Not checked: queue count with a real waiting player in the browser (jsdom + API shape only), Firefox/WebKit, populated-data pass beyond the seeded tournaments.
