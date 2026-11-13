# B364 — Phòng tab redesign R1 "Sảnh gỗ" (photo hero + table cards + live mini boards)
**Status:** OPEN — built 2026-11-13 (3633 tests; e2e lobby-patch-incremental/room-lifecycle/leave-then-create/ghost-viewers/session-eviction pass) on feature/364-rooms-photo-hall (uncommitted, awaiting user review). 3629 tests; real-browser pass :3101 desktop+375 light/dark: mini boards refresh (+5–6 stones / 6 s), no console errors, no h-scroll. Not verified: iOS Safari, client clock skew vs server startedAt, swap2 colours on the mini board (assumes black-first alternation).
**Area:** client/index.html (#panel-tables), client/js/lobby.js, client/js/lobby-home.js, client/css/shell.css, client/assets/img/, server/managers/RoomManager.js (listRooms), server/socket/state.js, server/socket/handlers/GameHandler.js, server/socket/SocketHandler.js
**From:** user 2026-11-13 "r1." — features/rooms-redesign (mockup r1-photo-hall, gallery)   **Depends:** —

## Problem
Phòng tab is a plain list with large empty space (shot features/rooms-redesign/shots cur-*).

## Scope
1. Server: `listRooms` adds `players[i].rating` (members, room's rule category, rounded; null otherwise), `startedAt` and `moves` (flat [x,y,…]) while a game is ongoing.
2. Server: after a move, `scheduleLobbyBoardUpdate(io)` → one lobby flush per LOBBY_BOARD_THROTTLE_MS (2500) per io; no per-move emit.
3. Client: photo hero inside #panel-tables (Pixabay 3339748, credited) with 4 live counts, 3-box code form (Home behaviour) and Tạo phòng; global zen-hero hidden on rooms.
4. Client: room rows → table cards grid (mini SVG board / empty board + Ngồi vào, flag state+elapsed, watchers, vs with avatar+rating, meta tags); "Mở bàn mới" ghost card; online line → avatar stack + names line.
5. Phone (≤860px): compact hero, horizontal cards (board 112px left).
6. Tests: RoomManager listRooms fields, throttle, lobby.js card render; cache-bust.

## User changes during build (2026-11-13)
- No hero "Tạo phòng": the grid's first card "Mở bàn mới" (#btn-create, e2e hook) is the only create entry.
- Phòng/Bàn/Quan sát filters removed → one label "Đang chơi · N" (N = live games); home pulse link just opens #rooms.
- Online names line removed: avatars only, each = PM button (title = name), "+N" opens the full list.
- Ratings show "?" when provisional (rd > 110), same as profile/user card (server/managers/seat-rating.js).

## Don't
- Touch BoardRenderer / board.js / game.css board rules; mini board is lobby-only SVG.
- Emit per move to the lobby, or add a new socket event.

## Traps
- `RoomManager.test.js` counts `broadcastRoomUpdate(io` sites (24) — don't add any.
- `lobby:patch` diff is JSON-equality: `startedAt` must be stable (set once at game start).
- Hash-only reload in Playwright keeps the DOM (use ?f=N).

## Why this way
Positions ride the existing diffed patch (B117/B230), so no new event or client path; throttle bounds traffic. Rejected: per-move emit (lobby traffic ∝ moves). Photo: user picked R1 (Home stays photo-free).
Notes: docs/knowledge/ui-ux/fe-media-assets.md, ux-responsive-mobile-first.md.

## Done when
- Jest: listRooms rating/moves/startedAt, throttle; lobby jsdom card render; `npm test` green; `node scripts/cache-bust.js` OK.
- Real-browser pass desktop + 375 light/dark with a live game whose mini board updates.
