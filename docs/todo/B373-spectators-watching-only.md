# B373 — Room "Khán giả" lists only viewers actually watching
**Status:** OPEN (fixed on fix/373-spectators-watching-only; awaiting real-browser check)
**Area:** server/socket/{SocketHandler,handlers/LobbyHandler,handlers/RoomHandler}.js, client/js/room-ui.js
**From:** user report 2026-11-13   **Depends:** #372

## Problem
Viewers who left the table page without leaving the room (went to lobby/home, closed the tab) still
showed in Khán giả / the "N đang xem" stack as watching.

## Scope
1. Room-member presence = 'active' only while the user's socket is the room page of that room
   (`socket.data.roomPageId`, set on room:create/room:join/#367 rejoin/reconnect with `auth.roomId`).
2. Any other page's connect / presence report → room presence 'away' (site-wide presence unchanged).
3. Client lists only unseated users with presence 'active' (list, tab, audience stack).
## Don't
- Don't use 'disconnected' for "on another page": it drives host transfer, empty-room grace, ghost reap.
- Don't change seat semantics or #115 (viewers keep their place indefinitely).
## Traps
- One socket per user (new page evicts the old), so the session socket is the only page.
- A fresh room-page load has no `auth.roomId`; its room:join marks it active.
## Done when
- Viewer → lobby: disappears from the room's list; back to the room: reappears. Real-browser pass.
