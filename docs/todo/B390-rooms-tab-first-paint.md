# B390 — Rooms tab first paint: cards wait for the socket, then fade in one by one (up to ~1.9 s)
**Status:** DONE 2026-11-15 (scope 1+2; 3 seeding not done — not needed for the visible cost)
**Area:** client/js/lobby.js (`renderRoomList`, `buildRoomRowHtml`, `lobby:update`), client/js/lobby-home.js (`setLobbySubscribed`), client/css/main.css (`.animate-fade-up`), client/tests/
**From:** user 2026-11-15 "User mới/cũ có thể nhìn thấy tất cả bàn đang chơi một cách nhanh chóng"   **Depends:** —

## Problem
- The room list comes only over the socket: connect → `lobby:subscribe` (sent when the Rooms screen opens) → `lobby:update`. On a cold load the cards wait for the whole WebSocket handshake through Cloudflare.
- Every snapshot does a full `renderRoomList` with a staggered fadeUp: 0.04·i s delay + 0.7 s, `backwards` fill (invisible until the delay ends). 30 cards → last visible ~1.2 s, settled ~1.9 s.
  It replays on every tab switch, return to a visible browser tab and reconnect.
- With prefers-reduced-motion, main.css cuts the duration but the inline delay still hides cards.
## Scope
1. A snapshot that replaces cards already on screen renders them at once (no stagger). Keep at most a short, capped entrance on the very first paint, or none.
2. Keep the last known list on the screen while re-subscribing (tab switch / visibility) instead of blanking or re-animating it.
3. Optional (decide first): seed the first paint without the socket, e.g. rooms page in `/api/home` or a small `/api/lobby/rooms`, then let `lobby:update` take over.
## Don't
- Change the patch path (`applyLobbyPatch`) or the server diff.
- Change the card design (#364).
## Traps
- A seeded list and the socket snapshot can disagree; the snapshot must win (replace the map, as `lobby:update` does now).
- Client edit → `node scripts/cache-bust.js --write`.
## Why this way
Biggest visible cost is client-side and costs no bandwidth. Knowledge: docs/knowledge/ui-ux/INDEX.md (motion), none on seeding yet.
## Done when
- jsdom: a second `lobby:update` adds no `animation-delay` to cards already shown; reduced-motion shows all cards at once.
- Real browser: Rooms tab cards visible ≤ 1 frame after `lobby:update`; `npm test` green.
