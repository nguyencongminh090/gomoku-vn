# B449 — Club chat: member polls (bình chọn)
**Status:** OPEN — idea only; size L, needs `features/club-polls/` intake before any code
**Area:** `server/` (new poll tables, ClubService/route), `client/js/club.js` (poll card in the stream, composer command), migration, tests
**From:** [features/club-polls](../../features/club-polls/planning.md) (user answer during #447, 2026-11-24: "Có thể là tạo bình chọn (cho phép thành viên tạo vote)")   **Depends:** B447

## Problem
Members want to create votes inside club chat; #447 only has /ghim and /giaohuu.
## Scope
1. Resolve `features/club-polls/planning.md` with the user: who may create (any member vs staff), options count, single/multi choice, close time, anonymous or named votes, edit/delete, staff toggle.
2. Then: `/binhchon` command (gated by a new `ClubChatCommands` toggle), poll card as a `club_messages.kind`, vote endpoint, REST-polled tallies.
## Don't
- New socket on the club page; client-side vote counting.
## Done when
- Decided with the user, then backend + jsdom + real-browser pass.
