# Bạn bè page (social.html) redesign — planning

Scope: `client/social.html` + `client/js/social.js` (notifications, challenges, friend requests, add friend, friends, DMs).
Mockups: `mockups/s1…s8.html` fragments + `common.css` (+ `_sheet.html` shared phone DM thread), injected into the
real page by `shoot.js` (isolated server `PORT=3101 GOMOKU_DB_PATH=<scratch>.db node server/index.js`; `/api/friends*`,
`/api/dm*`, `/api/challenges*` stubbed with the fixture). `s0-current` = today's page on the same fixture.
Frames: light/dark 1280, `-sparse` (new account, 0 friends), `-busy` (28 friends, 5 requests), 768, 375, `375-thread`.
Gallery: `gallery/index.html` → https://claude.ai/artifact/Q5rH73LiRvXhVQFHRf7WVR
Photos: Pixabay 2259473 (S4), 1579841 (S5), reused from rooms-redesign; credits in `img/stock-credits.json` (img/, shots/ gitignored).
Stage-1 answers (2026-11-13): all four complaints (too many equal boxes, friends feel lifeless, not the new style,
DMs cramped); wants lively content, easy to befriend/see each other, clear hierarchy; 6–8 mockups, may assume backend;
photos per mockup.

## Name rule (user note)
Names never run long: one line, ellipsis, full name in `title` (`.nm` in common.css; every flex/grid ancestor
`min-width: 0`). Fixture has the 24-char max (`Nguyễn Hoàng Phương Thảo`) and a no-space 24-char name. shoot.js checks
every frame: no horizontal scroll at any width (80/80 frames). S0 today wraps names to 2 lines and breaks mid-word.

## Directions
- S1 Sảnh bạn bè — presence-first seat cards (Thách đấu / Xem / Nhắn), slim "Cần bạn trả lời" rail.
- S2 Hộp việc — prioritized inbox (challenge hero ticket → requests → unread), online friends secondary.
- S3 Trò chuyện — messenger: story strip + conversations, challenge/result cards inside chat, profile pane.
- S4 Thẻ kết bạn — player card hero (photo, name#code, QR, share link), big search, suggestions.
- S5 Quán trà — tea photo hero "N bạn đang ở quán", online strip, friend activity feed with reactions.
- S6 Bàn cờ bạn bè — friends as stones on a board around you; tap → card; list toggle.
- S7 Câu lệnh — Home M4 sentence "Thách [ai] một ván [luật] [giờ]" + three lanes.
- S8 Bento — tiles: online, pending challenge, requests, code/QR, chats, rival, feed.

## Data map
Already sent: friends {username, displayName, avatarUrl, online}, incoming/outgoing requests, my code, DM
conversations {with, last, unread} + history, challenges {incoming, outgoing} with settings, notifications.
Needs backend: per-friend activity state (playing / watching + elapsed), rating per friend, head-to-head record +
last games, challenge expiry countdown, mutual friends / suggestions with reason, invite link, friend activity
feed + reactions, challenge/result cards inside a DM thread.

## Open questions (pre-decision)
1. Which direction (or mix)?
2. Which backend items to add (presence detail is the cheapest high-value one)?
3. Phone: DM as full-screen view (all directions use it) — keep?
4. Photo (S4/S5) or no photo?
5. Where does Bạn bè live in the nav (today: no top-level entry)?

## Decisions 2026-11-13
- **S3 Trò chuyện chosen** (user: "S3"). No photo.
- Backend, all three in the first build: presence detail (playing + elapsed / watching / free), game cards inside the
  chat (pending challenge + finished-game result between the two), right profile pane (rating, head-to-head, win %, last 5).
- Nav: chat-circle icon with unread badge next to the bell (desktop + phone header); phone tab bar unchanged.
- Desktop opens the most recent conversation; none → empty state with my code + people online.
- Phone: list → full-screen thread (`_sheet.html` shape). Formalized as #370 ([docs/todo/B370](../../docs/todo/B370-social-chat-first.md)).
